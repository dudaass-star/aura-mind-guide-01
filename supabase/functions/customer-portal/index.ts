import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const token: string | undefined = body?.token;
    let userId: string | undefined = body?.userId;
    const gatewayHint: string | undefined = body?.gateway;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // 1. Fonte do user_id: JWT autenticado (preferido) ou token legacy
    if (!userId) {
      const authHeader = req.headers.get("Authorization");
      if (authHeader?.startsWith("Bearer ")) {
        const jwt = authHeader.replace("Bearer ", "");
        const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
        const { data: claims } = await anonClient.auth.getClaims(jwt);
        userId = claims?.claims?.sub as string | undefined;
      }
    }
    if (!userId && token) {
      const { data: pt } = await supabase
        .from("user_portal_tokens")
        .select("user_id")
        .eq("token", token)
        .maybeSingle();
      userId = pt?.user_id;
    }

    // Fallback do dunning em modo degradado (sem profile): o token do botão é o
    // código de um short_link com a URL de pagamento do gateway. Sem isso, o
    // template de aviso não teria como levar a lugar nenhum.
    if (!userId && token && /^[A-Za-z0-9]{4,12}$/.test(token)) {
      const { data: sl } = await supabase
        .from("short_links")
        .select("url, expires_at")
        .eq("code", token)
        .maybeSingle();
      if (sl?.url) {
        const expired = sl.expires_at && new Date(sl.expires_at).getTime() < Date.now();
        if (!expired) return json({ url: sl.url, provider: "short_link" }, 200);
        return json({ error: "Esse link expirou. Responda no WhatsApp que a gente gera outro." }, 410);
      }
    }

    if (!userId) {
      return json({ error: "Sessão necessária" }, 401);
    }

    // 2. Pega email/phone do profile pra achar customer no Stripe
    const { data: profile } = await supabase
      .from("profiles")
      .select("email, phone, name, card_gateway, asaas_customer_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!profile) {
      return json({ error: "Perfil não encontrado" }, 404);
    }

    // Roteamento por gateway. Hint do cliente + confirmação via profile.
    const isAsaasCard =
      gatewayHint === "asaas-card" || profile.card_gateway === "asaas";

    if (isAsaasCard) {
      // Asaas cartão: prioriza cobrança EM ABERTO (OVERDUE/PENDING) — abrir uma
      // fatura já paga confunde quem clicou em "atualizar pagamento".
      const { data: openPay } = await supabase
        .from("asaas_payments")
        .select("invoice_url, status, created_at")
        .eq("user_id", userId)
        .in("status", ["OVERDUE", "PENDING"])
        .not("invoice_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (openPay?.invoice_url) {
        return json({ url: openPay.invoice_url, provider: "asaas" }, 200);
      }
      // Sem cobrança em aberto: cai na mais recente (Asaas permite trocar cartão lá).
      const { data: asaasPay } = await supabase
        .from("asaas_payments")
        .select("invoice_url, status, created_at")
        .eq("user_id", userId)
        .not("invoice_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (asaasPay?.invoice_url) {
        return json({ url: asaasPay.invoice_url, provider: "asaas" }, 200);
      }
      // Fallback via customer_id caso user_id não bata em rows antigas.
      if (profile.asaas_customer_id) {
        const { data: byCustomer } = await supabase
          .from("asaas_payments")
          .select("invoice_url, created_at")
          .eq("asaas_customer_id", profile.asaas_customer_id)
          .not("invoice_url", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (byCustomer?.invoice_url) {
          return json({ url: byCustomer.invoice_url, provider: "asaas" }, 200);
        }
      }
      return json(
        { error: "Não encontramos sua cobrança pra atualizar o cartão. Fale com o suporte." },
        404,
      );
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      apiVersion: "2023-10-16",
    });

    // Cobrança Asaas em aberto vence o Stripe: quem já teve assinatura no
    // cartão e hoje paga PIX ainda tem customer no Stripe, e cairia num
    // Billing Portal sem nada pra pagar.
    {
      const { data: openAsaas } = await supabase
        .from("asaas_payments")
        .select("invoice_url, status, created_at")
        .eq("user_id", userId)
        .in("status", ["OVERDUE", "PENDING"])
        .not("invoice_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (openAsaas?.invoice_url) {
        return json({ url: openAsaas.invoice_url, provider: "asaas" }, 200);
      }
    }

    // 3. Resolve customer no Stripe via email (com fallback pra phone no metadata)
    let customerId: string | null = null;
    if (profile.email) {
      const byEmail = await stripe.customers.list({ email: profile.email, limit: 1 });
      if (byEmail.data.length > 0) customerId = byEmail.data[0].id;
    }

    if (!customerId && profile.phone) {
      // Fallback: busca por phone no metadata
      const search = await stripe.customers.search({
        query: `metadata['phone']:'${profile.phone}'`,
        limit: 1,
      });
      if (search.data.length > 0) customerId = search.data[0].id;
    }

    if (!customerId) {
      // Fallback Asaas: usuário pagou via PIX (recorrente ou Automático Bacen).
      // Devolve a invoice_url mais recente em OVERDUE/PENDING pra ele quitar.
      const { data: asaasPay } = await supabase
        .from("asaas_payments")
        .select("invoice_url, status, created_at")
        .eq("user_id", userId)
        .in("status", ["OVERDUE", "PENDING"])
        .not("invoice_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (asaasPay?.invoice_url) {
        return json({ url: asaasPay.invoice_url, provider: "asaas" }, 200);
      }
      return json(
        { error: "Não encontramos uma cobrança em aberto. Fale com o suporte." },
        404,
      );
    }

    // 4. Cria sessão do Billing Portal
    const origin = req.headers.get("origin") || "https://olaaura.com.br";
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/meu-espaco`,
      locale: "pt-BR",
    });

    return json({ url: portalSession.url }, 200);
  } catch (err: any) {
    console.error("[customer-portal] erro:", err?.message || err);
    return json({ error: err?.message || "Erro inesperado" }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}