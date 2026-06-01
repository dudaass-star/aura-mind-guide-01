// Vincula o auth.uid() recém-criado ao profile existente.
// Lookup primário: email. Fallback: telefone enviado no body { phone }.
// Idempotente: roda no primeiro login de cada usuário do portal.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPhoneVariations, normalizeBrazilianPhone } from "../_shared/zapi-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Validate JWT and get user
    const supaJwt = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supaJwt.auth.getClaims(token);
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const newUserId = claims.claims.sub as string;
    const email = (claims.claims.email as string | undefined)?.toLowerCase().trim();

    // Lê telefone opcional do body (fallback quando email não bate).
    let phoneInput: string | undefined;
    try {
      if (req.headers.get("content-length") && req.headers.get("content-length") !== "0") {
        const body = await req.json().catch(() => ({}));
        if (body && typeof body.phone === "string") phoneInput = body.phone;
      }
    } catch (_) { /* body opcional */ }

    // Diagnóstico (mascarado): prefixo do email e últimos 4 dígitos do phone.
    const emailMask = email ? `${email.slice(0, 3)}***@${email.split("@")[1] ?? "?"}` : "(none)";
    const phoneMask = phoneInput ? `***${phoneInput.replace(/\D/g, "").slice(-4)}` : "(none)";
    console.log(`🔗 [link] start uid=${newUserId.slice(0, 8)} email=${emailMask} phoneInput=${phoneMask}`);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // 1) Se já existe profile para este auth.uid, nada a fazer.
    const { data: own } = await admin
      .from("profiles")
      .select("user_id")
      .eq("user_id", newUserId)
      .maybeSingle();
    if (own) {
      console.log(`🔗 [link] already-linked uid=${newUserId.slice(0, 8)}`);
      return new Response(JSON.stringify({ linked: true, alreadyLinked: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) Procurar profile legado pelo email (caminho preferencial).
    let legacy: { id: string; user_id: string | null; email: string | null; phone: string | null } | null = null;
    let matchedBy: "email" | "phone" | null = null;

    if (email) {
      const { data, error } = await admin
        .from("profiles")
        .select("id, user_id, email, phone")
        .ilike("email", email)
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error("lookup error (email)", error);
        return new Response(JSON.stringify({ error: "lookup_failed" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (data) {
        legacy = data as any;
        matchedBy = "email";
        console.log(`🔗 [link] email-hit profile=${data.id} legacyUid=${data.user_id?.slice(0, 8) ?? "null"}`);
      } else {
        console.log(`🔗 [link] email-miss email=${emailMask}`);
      }
    }

    // 3) Fallback por telefone (só se veio phone no body).
    if (!legacy && phoneInput) {
      const normalized = normalizeBrazilianPhone(phoneInput);
      const variations = Array.from(new Set([normalized, ...getPhoneVariations(phoneInput)])).filter(Boolean);
      console.log(`🔗 [link] phone-lookup variations=${variations.length} normalized=***${normalized.slice(-4)}`);
      if (variations.length > 0) {
        const { data, error } = await admin
          .from("profiles")
          .select("id, user_id, email, phone")
          .in("phone", variations)
          .limit(1)
          .maybeSingle();
        if (error) {
          console.error("lookup error (phone)", error);
          return new Response(JSON.stringify({ error: "lookup_failed" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (data) {
          legacy = data as any;
          matchedBy = "phone";
          console.log(`🔗 [link] phone-hit profile=${data.id} legacyUid=${data.user_id?.slice(0, 8) ?? "null"}`);

          // Proteção: se o profile já está vinculado a outro auth user ativo, recusa.
          if (data.user_id && data.user_id !== newUserId) {
            const { data: existingUser } = await admin.auth.admin.getUserById(data.user_id);
            const lastSignIn = existingUser?.user?.last_sign_in_at;
            // Só bloqueia se o outro auth user existir E tiver logado nos últimos 30 dias.
            // Profiles com user_id "fantasma" (UUID gerado pelo WhatsApp sem auth real)
            // ou auth users antigos que nunca voltaram não devem travar o vínculo legítimo.
            const recentlyActive = lastSignIn
              ? (Date.now() - new Date(lastSignIn).getTime()) < 30 * 24 * 60 * 60 * 1000
              : false;
            console.log(`🔗 [link] phone-taken-check existingUser=${existingUser?.user?.id?.slice(0, 8) ?? "null"} lastSignIn=${lastSignIn ?? "null"} recentlyActive=${recentlyActive}`);
            if (recentlyActive) {
              console.log(`🔗 [link] phone_taken (recent activity within 30d)`);
              return new Response(JSON.stringify({ linked: false, reason: "phone_taken" }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
          }
        } else {
          console.log(`🔗 [link] phone-miss variations=${variations.length}`);
        }
      }
    }

    if (!legacy) {
      console.log(`🔗 [link] no_profile email=${emailMask} phoneInput=${phoneMask}`);
      return new Response(JSON.stringify({ linked: false, reason: "no_profile" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4) Propaga o novo user_id para tabelas relacionadas ANTES de atualizar o profile,
    // porque várias delas têm FK para profiles.user_id e bloqueariam o update.
    const oldUserId = legacy.user_id;
    if (oldUserId && oldUserId !== newUserId) {
      const tables = [
        "messages", "sessions", "session_themes", "session_ratings",
        "commitments", "checkins", "monthly_letters", "monthly_reports",
        "time_capsules", "user_milestones", "user_evolution_summary",
        "weekly_questions", "user_journey_history", "scheduled_tasks",
        "conversation_followups", "aura_response_state",
        "user_insights", "user_meditation_history", "weekly_plans",
        "asaas_payments",
      ];
      const results = await Promise.allSettled(
        tables.map((t) =>
          admin.from(t).update({ user_id: newUserId }).eq("user_id", oldUserId)
        )
      );
      const failed = results
        .map((r, i) => ({ r, t: tables[i] }))
        .filter(({ r }) => r.status === "rejected" || (r.status === "fulfilled" && (r.value as any)?.error));
      if (failed.length > 0) {
        for (const { r, t } of failed) {
          const err = r.status === "rejected" ? r.reason : (r.value as any)?.error;
          console.error(`🔗 [link] propagate-fail table=${t}`, err);
        }
      }
    }

    // 5) Atualiza user_id do profile existente para o novo auth.uid() (e preenche email se faltava).
    const updatePayload: Record<string, unknown> = {
      user_id: newUserId,
      updated_at: new Date().toISOString(),
    };
    if (!legacy.email && email) updatePayload.email = email;

    const { error: updErr } = await admin
      .from("profiles")
      .update(updatePayload)
      .eq("id", legacy.id);

    if (updErr) {
      console.error("🔗 [link] update error", updErr);
      return new Response(JSON.stringify({ error: "link_failed", detail: updErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log(`🔗 [link] update-ok profile=${legacy.id} newUid=${newUserId.slice(0, 8)} matchedBy=${matchedBy}`);

    console.log(`✅ Linked auth uid ${newUserId} to legacy profile (matchedBy: ${matchedBy})`);

    return new Response(JSON.stringify({ linked: true, migrated: true, matchedBy }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("link-portal-account error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});