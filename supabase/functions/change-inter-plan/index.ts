// Edge function: troca de plano/ciclo no PIX Automático do Inter.
//
// No Bacen o VALOR do mandato é imutável: mudar de plano exige nova autorização
// do pagador. Então a troca é sempre "cancela o mandato atual + novo QR
// composto" — o cliente escaneia uma vez e o novo valor passa a valer.
// O acesso corrente não é tocado: continua até `plan_expires_at`.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { cancelMandate } from "../_shared/inter-cycles.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VALID_PLANS = ["essencial", "direcao", "transformacao"];
const VALID_BILLING = ["monthly", "quarterly", "semestral", "yearly"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json() as Record<string, string>;
    const { token } = body;
    const plan = body.plan || body.targetPlan;
    // O portal manda "semiannual"; o resto do sistema fala "semestral".
    const billing = body.billing === "semiannual" ? "semestral" : body.billing;
    const authHeader = req.headers.get("Authorization");
    let authenticatedUserId: string | null = null;
    if (authHeader?.startsWith("Bearer ")) {
      const authClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: claimsData } = await authClient.auth.getClaims(authHeader.slice(7));
      authenticatedUserId = typeof claimsData?.claims?.sub === "string"
        ? claimsData.claims.sub
        : null;
    }
    if (!token && !authenticatedUserId) return json({ error: "Sessão inválida" }, 401);
    if (!plan || !VALID_PLANS.includes(plan)) return json({ error: "Plano inválido" }, 400);
    if (!billing || !VALID_BILLING.includes(billing)) return json({ error: "Ciclo inválido" }, 400);

    // A identidade vem do JWT validado ou do token passwordless. O `userId`
    // enviado pelo navegador nunca é fonte de autorização.
    let resolvedUserId = authenticatedUserId;
    if (!resolvedUserId) {
      const { data: tokenRow } = await supabase
        .from("user_portal_tokens").select("user_id").eq("token", token).maybeSingle();
      if (!tokenRow?.user_id) return json({ error: "Link inválido ou expirado" }, 400);
      resolvedUserId = tokenRow.user_id;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, user_id, name, email, phone, plan, billing_cycle, card_gateway")
      .eq("user_id", resolvedUserId).maybeSingle();
    if (!profile) return json({ error: "Cadastro não encontrado" }, 404);
    if (profile.card_gateway !== "inter") {
      return json({ error: "Assinatura não é PIX Automático do Inter", gateway: profile.card_gateway }, 400);
    }

    const { data: current } = await supabase
      .from("inter_pix_recurrences")
      .select("id_rec, customer_cpf, plan, billing_period")
      .eq("user_id", profile.id)
      .is("replaced_by_id_rec", null)
      .not("id_rec", "is", null)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!current?.id_rec) return json({ error: "Mandato ativo não encontrado" }, 404);
    if (current.plan === plan && current.billing_period === billing) {
      return json({ error: "Você já está nesse plano" }, 400);
    }

    // A reautorização precisa de um token do portal (a função de criação lê o
    // perfil por ele). Garante um para o caso do fluxo autenticado.
    let portalToken = token;
    if (!portalToken) {
      const { data: tk } = await supabase
        .from("user_portal_tokens").select("token").eq("user_id", profile.user_id).maybeSingle();
      if (!tk?.token) {
        const { data: created } = await supabase
          .from("user_portal_tokens").insert({ user_id: profile.user_id }).select("token").maybeSingle();
        portalToken = created?.token as string;
      } else {
        portalToken = tk.token as string;
      }
    }
    if (!portalToken) return json({ error: "Não consegui preparar a nova autorização" }, 500);

    // Cria primeiro com contrato novo. O mandato atual só é encerrado depois de
    // termos um QR novo persistido; assim uma falha não interrompe a assinatura.
    const { data: created, error: invokeErr } = await supabase.functions.invoke(
      "criar-pix-recorrente-inter",
      {
        body: {
          mode: "reauthorize",
          token: portalToken,
          plan,
          billing,
          name: profile.name || "Cliente",
          email: profile.email,
          phone: profile.phone,
          cpf: current.customer_cpf,
          requestKey: crypto.randomUUID(),
          deferReplacement: "true",
        },
      },
    );
    if (invokeErr || (created as Record<string, unknown>)?.error) {
      console.error("[change-inter-plan] falha gerando novo QR:", invokeErr || created);
      return json({
        error: "Não consegui preparar o novo QR. Seu débito atual continua funcionando normalmente.",
      }, 502);
    }

    const newIdRec = (created as Record<string, unknown>)?.authorizationId as string | undefined;
    if (!newIdRec) return json({ error: "A nova autorização não foi confirmada" }, 502);

    const canceled = await cancelMandate(supabase, current.id_rec);
    if (!canceled.ok) {
      await cancelMandate(supabase, newIdRec).catch(() => null);
      return json({
        error: "Não consegui encerrar o débito atual. O novo QR foi desfeito e nada mudou na sua assinatura.",
      }, 502);
    }
    await supabase.from("inter_pix_recurrences")
      .update({ replaced_by_id_rec: newIdRec }).eq("id_rec", current.id_rec);

    console.log(`[change-inter-plan] ${profile.user_id}: ${current.plan}/${current.billing_period} → ${plan}/${billing}`);
    return json({ success: true, requiresNewAuthorization: true, plan, billing, ...(created as object) });
  } catch (err) {
    console.error("[change-inter-plan] erro:", err);
    return json({ error: err instanceof Error ? err.message : "Erro desconhecido" }, 500);
  }
});