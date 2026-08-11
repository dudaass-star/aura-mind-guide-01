// Edge function: inter-probe
// Fase 0-B: prova de viabilidade do Banco Inter como trilho de PIX Automático.
//
// A pergunta que a documentação não responde: o nosso runtime consegue
// apresentar CERTIFICADO DE CLIENTE (mTLS)? A API do Inter exige mTLS no OAuth
// e em todas as rotas. Se `Deno.createHttpClient` não existir ou o handshake
// falhar, o Inter só é viável com um proxy no meio — e aí a economia de tarifa
// deixa de compensar o esforço.
//
// Read-only: pega token e faz um GET de leitura em Pix Automático. Não cria
// nada, não cobra ninguém.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const OAUTH_URL = "https://cdpj.partners.bancointer.com.br/oauth/v2/token";
const API_BASE = "https://cdpj.partners.bancointer.com.br";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const internal = Deno.env.get("INTERNAL_WEBHOOK_SECRET");
  const provided = req.headers.get("x-internal-secret");
  const url = new URL(req.url);
  // `?capability=1` responde só a pergunta do runtime (existe suporte a mTLS?).
  // Não toca em credencial nem em rede externa, então é seguro sem o segredo.
  const capabilityOnly = url.searchParams.get("capability") === "1";
  if (capabilityOnly) {
    return new Response(
      JSON.stringify({
        runtimeSupportsMtls: typeof (Deno as any).createHttpClient === "function",
        denoVersion: (Deno as any).version?.deno ?? null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  if (!internal || provided !== internal) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const steps: Record<string, unknown> = {};

  // 1. O runtime suporta certificado de cliente?
  const hasHttpClient = typeof (Deno as any).createHttpClient === "function";
  steps.runtimeSupportsMtls = hasHttpClient;
  if (!hasHttpClient) {
    return new Response(
      JSON.stringify(
        {
          verdict: "INVIÁVEL_SEM_PROXY",
          reason: "Deno.createHttpClient indisponível neste runtime — não há como apresentar certificado de cliente.",
          steps,
        },
        null,
        2,
      ),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // 2. Credenciais presentes?
  const clientId = Deno.env.get("INTER_CLIENT_ID");
  const clientSecret = Deno.env.get("INTER_CLIENT_SECRET");
  const certPem = Deno.env.get("INTER_CERT_PEM");
  const keyPem = Deno.env.get("INTER_KEY_PEM");
  const missing = [
    !clientId && "INTER_CLIENT_ID",
    !clientSecret && "INTER_CLIENT_SECRET",
    !certPem && "INTER_CERT_PEM",
    !keyPem && "INTER_KEY_PEM",
  ].filter(Boolean);
  steps.credentials = missing.length ? { ok: false, missing } : { ok: true };

  if (missing.length) {
    return new Response(
      JSON.stringify(
        {
          verdict: "AGUARDANDO_CREDENCIAIS",
          reason: `Faltam secrets: ${missing.join(", ")}. Crie a integração no Internet Banking do Inter (Soluções para sua empresa → Nova Integração) com os escopos de Pix Automático e baixe certificado + chave.`,
          steps,
        },
        null,
        2,
      ),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  let client: unknown;
  try {
    client = (Deno as any).createHttpClient({
      cert: certPem,
      key: keyPem,
    });
    steps.httpClientCreated = true;
  } catch (e) {
    return new Response(
      JSON.stringify(
        {
          verdict: "INVIÁVEL_SEM_PROXY",
          reason: `createHttpClient rejeitou o par cert/key: ${e instanceof Error ? e.message : String(e)}`,
          steps,
        },
        null,
        2,
      ),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // 3. Token OAuth (client_credentials sobre mTLS)
  let accessToken: string | null = null;
  try {
    const body = new URLSearchParams({
      client_id: clientId!,
      client_secret: clientSecret!,
      grant_type: "client_credentials",
      scope: "pix.automatico.read pix.automatico.write",
    });
    const resp = await fetch(OAUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      // @ts-expect-error extensão do Deno ao fetch padrão
      client,
    });
    const text = await resp.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* body não-JSON */ }
    accessToken = json?.access_token ?? null;
    steps.oauth = {
      status: resp.status,
      ok: resp.ok,
      gotToken: Boolean(accessToken),
      scopes: json?.scope ?? null,
      bodyPreview: accessToken ? "(token omitido)" : text.slice(0, 300),
    };
  } catch (e) {
    steps.oauth = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  if (!accessToken) {
    return new Response(
      JSON.stringify(
        {
          verdict: "MTLS_OU_CREDENCIAL_FALHOU",
          reason: "O handshake/OAuth não devolveu token. Ver steps.oauth: erro de TLS indica runtime; 400/401 com corpo indica escopo ou credencial.",
          steps,
        },
        null,
        2,
      ),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // 4. GET de leitura em Pix Automático (não cria nada)
  try {
    const resp = await fetch(`${API_BASE}/pix/v2/recorrencia?inicio=${new Date(Date.now() - 7 * 864e5).toISOString()}&fim=${new Date().toISOString()}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      // @ts-expect-error extensão do Deno ao fetch padrão
      client,
    });
    const text = await resp.text();
    steps.pixAutomaticoRead = { status: resp.status, ok: resp.ok, bodyPreview: text.slice(0, 400) };
  } catch (e) {
    steps.pixAutomaticoRead = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const readOk = (steps.pixAutomaticoRead as any)?.ok === true;
  return new Response(
    JSON.stringify(
      {
        verdict: readOk ? "VIÁVEL" : "TOKEN_OK_MAS_RECURSO_INDISPONÍVEL",
        reason: readOk
          ? "mTLS funciona no runtime e a conta responde no Pix Automático. Inter é viável como trilho."
          : "mTLS funciona (token emitido), mas a leitura de Pix Automático não passou — provavelmente escopo não habilitado na integração ou recurso não liberado na conta.",
        steps,
      },
      null,
      2,
    ),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
