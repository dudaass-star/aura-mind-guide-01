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
    if (!userId) {
      return json({ error: "Sessão necessária" }, 401);
    }

    // 2. Pega email/phone do profile pra achar customer no Stripe
    const { data: profile } = await supabase
      .from("profiles")
      .select("email, phone, name")
      .eq("user_id", userId)
      .maybeSingle();

    if (!profile) {
      return json({ error: "Perfil não encontrado" }, 404);
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      apiVersion: "2023-10-16",
    });

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
      return json(
        { error: "Não encontramos sua assinatura no nosso sistema de pagamento. Fale com o suporte." },
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