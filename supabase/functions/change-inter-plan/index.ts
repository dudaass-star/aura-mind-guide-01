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

    const { token, plan, billing } = await req.json() as Record<string, string>;
    if (!token) return json({ error: "Token ausente" }, 400);
    if (!plan || !VALID_PLANS.includes(plan)) return json({ error: "Plano inválido" }, 400);
    if (!billing || !VALID_BILLING.includes(billing)) return json({ error: "Ciclo inválido" }, 400);

    const { data: tokenRow } = await supabase
      .from("user_portal_tokens").select("user_id").eq("token", token).maybeSingle();
    if (!tokenRow?.user_id) return json({ error: "Link inválido ou expirado" }, 400);

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, user_id, name, email, phone, plan, billing_cycle, card_gateway")
      .eq("user_id", tokenRow.user_id).maybeSingle();
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

    // 1) Novo mandato primeiro? Não: o Bacen não permite dois mandatos ativos
    // com o mesmo contrato. Cancela, depois gera o novo QR.
    const canceled = await cancelMandate(supabase, current.id_rec);
    if (!canceled.ok) {
      return json({ error: "Não consegui encerrar o débito automático atual. Tente novamente." }, 502);
    }

    // 2) Novo QR composto no plano escolhido (mode reauthorize: sem trial e já
    // amarrado ao perfil existente).
    const { data: created, error: invokeErr } = await supabase.functions.invoke(
      "criar-pix-recorrente-inter",
      {
        body: {
          mode: "reauthorize",
          token,
          plan,
          billing,
          name: profile.name || "Cliente",
          email: profile.email,
          phone: profile.phone,
          cpf: current.customer_cpf,
        },
      },
    );
    if (invokeErr || (created as Record<string, unknown>)?.error) {
      console.error("[change-inter-plan] falha gerando novo QR:", invokeErr || created);
      return json({
        error: "Cancelei o débito antigo, mas não consegui gerar o novo QR. Fale com o suporte no WhatsApp.",
      }, 502);
    }

    console.log(`[change-inter-plan] ${profile.user_id}: ${current.plan}/${current.billing_period} → ${plan}/${billing}`);
    return json({ success: true, requiresNewAuthorization: true, plan, billing, ...(created as object) });
  } catch (err) {
    console.error("[change-inter-plan] erro:", err);
    return json({ error: err instanceof Error ? err.message : "Erro desconhecido" }, 500);
  }
});