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

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // 1) Se já existe profile para este auth.uid, nada a fazer.
    const { data: own } = await admin
      .from("profiles")
      .select("user_id")
      .eq("user_id", newUserId)
      .maybeSingle();
    if (own) {
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
      }
    }

    // 3) Fallback por telefone (só se veio phone no body).
    if (!legacy && phoneInput) {
      const normalized = normalizeBrazilianPhone(phoneInput);
      const variations = Array.from(new Set([normalized, ...getPhoneVariations(phoneInput)])).filter(Boolean);
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

          // Proteção: se o profile já está vinculado a outro auth user ativo, recusa.
          if (data.user_id && data.user_id !== newUserId) {
            const { data: existingUser } = await admin.auth.admin.getUserById(data.user_id);
            const lastSignIn = existingUser?.user?.last_sign_in_at;
            if (lastSignIn) {
              return new Response(JSON.stringify({ linked: false, reason: "phone_taken" }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
          }
        }
      }
    }

    if (!legacy) {
      return new Response(JSON.stringify({ linked: false, reason: "no_profile" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4) Atualiza user_id do profile existente para o novo auth.uid() (e preenche email se faltava).
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
      console.error("update error", updErr);
      return new Response(JSON.stringify({ error: "link_failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5) Propaga o novo user_id para tabelas relacionadas que usavam o user_id antigo.
    const oldUserId = legacy.user_id;
    if (oldUserId && oldUserId !== newUserId) {
      const tables = [
        "messages", "sessions", "session_themes", "session_ratings",
        "commitments", "checkins", "monthly_letters", "monthly_reports",
        "time_capsules", "user_milestones", "user_evolution_summary",
        "weekly_questions", "user_journey_history", "scheduled_tasks",
        "conversation_followups", "aura_response_state",
      ];
      await Promise.allSettled(
        tables.map((t) =>
          admin.from(t).update({ user_id: newUserId }).eq("user_id", oldUserId)
        )
      );
    }

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