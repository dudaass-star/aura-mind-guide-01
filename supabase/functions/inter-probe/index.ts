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
  // `?diagnose=1`: roda a sonda sem expor segredo nenhum (tokens são omitidos e
  // apenas status HTTP/erros de handshake voltam). Serve para validar credencial
  // recém-cadastrada sem precisar do INTERNAL_WEBHOOK_SECRET em mãos.
  const diagnose = url.searchParams.get("diagnose") === "1";
  if (capabilityOnly) {
    return new Response(
      JSON.stringify({
        runtimeSupportsMtls: typeof (Deno as any).createHttpClient === "function",
        denoVersion: (Deno as any).version?.deno ?? null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  if (!diagnose && (!internal || provided !== internal)) {
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
  // Normalização: o Inter às vezes entrega o certificado como base64 puro (DER
  // em base64, sem armadura PEM). `createHttpClient` só aceita PEM, então
  // reconstruímos o cabeçalho/rodapé e quebramos em linhas de 64 chars.
  const toPem = (raw: string | undefined, label: string) => {
    if (!raw) return raw;
    const v = raw.trim();
    if (v.includes("-----BEGIN")) {
      // remove linhas vazias que costumam entrar no copiar/colar
      return v.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0).join("\n") + "\n";
    }
    const b64 = v.replace(/[^A-Za-z0-9+/=]/g, "");
    const lines = b64.match(/.{1,64}/g) ?? [];
    return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
  };
  const certPem = toPem(Deno.env.get("INTER_CERT_PEM"), "CERTIFICATE");
  const keyPem = toPem(Deno.env.get("INTER_KEY_PEM"), "PRIVATE KEY");
  const missing = [
    !clientId && "INTER_CLIENT_ID",
    !clientSecret && "INTER_CLIENT_SECRET",
  ].filter(Boolean);
  const hasCertPair = Boolean(certPem && keyPem);
  // Diagnóstico de formato SEM vazar conteúdo: só o rótulo do cabeçalho PEM
  // (lista fechada) e o tamanho. Ajuda a identificar arquivo trocado.
  const pemShape = (v?: string) => {
    if (!v) return null;
    const labels = ["CERTIFICATE", "PRIVATE KEY", "RSA PRIVATE KEY", "ENCRYPTED PRIVATE KEY", "CERTIFICATE REQUEST", "PUBLIC KEY"];
    const found = labels.find((l) => v.includes(`-----BEGIN ${l}-----`)) ?? null;
    return { length: v.length, pemLabel: found, looksBinary: /[\x00-\x08]/.test(v.slice(0, 200)) };
  };
  steps.certShape = pemShape(certPem);
  steps.keyShape = pemShape(keyPem);
  // Classificação do DER: certificado X.509 carrega strings imprimíveis
  // (CN=, O=, nomes) no Subject/Issuer; uma chave PKCS#8 não carrega nenhuma.
  // Isso revela arquivo trocado sem expor conteúdo sensível.
  const classifyDer = (raw?: string) => {
    if (!raw) return null;
    try {
      const b64 = raw.replace(/-----[^-]+-----/g, "").replace(/[^A-Za-z0-9+/=]/g, "");
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const ascii = Array.from(bytes).map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : "\u0000")).join("");
      const words = (ascii.match(/[A-Za-z0-9.\- ]{5,}/g) ?? []).slice(0, 8);
      // rsaEncryption OID (2a 86 48 86 f7 0d 01 01 01) nos primeiros 40 bytes => PKCS#8
      const head = Array.from(bytes.slice(0, 40)).map((b) => b.toString(16).padStart(2, "0")).join("");
      const looksPkcs8Key = head.includes("2a864886f70d010101");
      return {
        derBytes: bytes.length,
        looksPkcs8Key,
        printableStrings: words,
      };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  };
  steps.certDer = classifyDer(Deno.env.get("INTER_CERT_PEM"));
  steps.credentials = missing.length
    ? { ok: false, missing }
    : { ok: true, mtlsCertPresent: hasCertPair };

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

  // Sem o par cert/key ainda é útil rodar: o OAuth do Inter exige mTLS, então a
  // resposta desta tentativa "nua" diz se as credenciais existem do lado deles
  // (erro de TLS/handshake) ou se estão inválidas (400/401 com corpo).
  let client: unknown = undefined;
  if (hasCertPair) {
    try {
      client = (Deno as any).createHttpClient({ cert: certPem, key: keyPem });
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
  } else {
    steps.httpClientCreated = false;
    steps.note = "Sem INTER_CERT_PEM/INTER_KEY_PEM: tentativa sem mTLS, apenas para diagnóstico.";
  }

  // 3. Token OAuth (client_credentials sobre mTLS) — varredura de escopos candidatos
  let accessToken: string | null = null;
  // Varredura de nomes de escopo, um por um: só assim descobrimos exatamente
  // quais estão registrados na integração (o Inter devolve só os concedidos).
  // O OAuth do Inter aplica rate limit agressivo (429), então a varredura é
  // curta e espaçada. `?scopes=a,b` permite testar nomes específicos.
  const scopesParam = url.searchParams.get("scopes");
  const scopeCandidates: (string | null)[] = scopesParam
    ? scopesParam.split(",").map((s) => (s.trim() === "" ? null : s.trim()))
    : [
        "pix.automatico.read pix.automatico.write",
        "recorrencia.read recorrencia.write",
        "cob.read cob.write pix.read pix.write",
      ];
  const scopeAttempts: any[] = [];
  for (const scope of scopeCandidates) {
    try {
      const params: Record<string, string> = {
        client_id: clientId!,
        client_secret: clientSecret!,
        grant_type: "client_credentials",
      };
      if (scope) params.scope = scope;
      const resp = await fetch(OAUTH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(params),
        ...(client ? { client } : {}),
      } as RequestInit);
      const text = await resp.text();
      let json: any = null;
      try { json = JSON.parse(text); } catch { /* body não-JSON */ }
      const token = json?.access_token ?? null;
      scopeAttempts.push({
        scope: scope ?? "(nenhum)",
        status: resp.status,
        gotToken: Boolean(token),
        grantedScopes: json?.scope ?? null,
        bodyPreview: token ? "(token omitido)" : text.slice(0, 200),
      });
      if (token && !accessToken) {
        accessToken = token;
        steps.oauth = {
          status: resp.status,
          ok: true,
          gotToken: true,
          scopeUsed: scope ?? "(nenhum)",
          scopes: json?.scope ?? null,
        };
      }
    } catch (e) {
      scopeAttempts.push({ scope: scope ?? "(nenhum)", error: e instanceof Error ? e.message : String(e) });
    }
    // Espaça as tentativas para não bater no rate limit do OAuth.
    await new Promise((r) => setTimeout(r, 3500));
  }
  steps.scopeAttempts = scopeAttempts;
  if (!accessToken) {
    steps.oauth = { ok: false, gotToken: false, note: "Nenhum escopo candidato foi aceito — ver scopeAttempts." };
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

  // 4. GET de leitura em Pix Automático (não cria nada) — varre caminhos possíveis
  const inicio = new Date(Date.now() - 7 * 864e5).toISOString();
  const fim = new Date().toISOString();
  const readPaths = [
    `/pix/v2/recorrencia?inicio=${inicio}&fim=${fim}`,
    `/pix-automatico/v2/recorrencia?inicio=${inicio}&fim=${fim}`,
    `/pix/v2/rec?inicio=${inicio}&fim=${fim}`,
    `/pix/v2/cobr?inicio=${inicio}&fim=${fim}`,
    `/pix/v2/solicrec?inicio=${inicio}&fim=${fim}`,
    `/cobranca/v3/cobrancas?dataInicial=${inicio.slice(0, 10)}&dataFinal=${fim.slice(0, 10)}`,
  ];
  const readAttempts: any[] = [];
  for (const p of readPaths) {
    try {
      const resp = await fetch(`${API_BASE}${p}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        ...(client ? { client } : {}),
      } as RequestInit);
      const text = await resp.text();
      readAttempts.push({ path: p.split("?")[0], status: resp.status, ok: resp.ok, bodyPreview: text.slice(0, 200) });
      if (resp.ok && !steps.pixAutomaticoRead) {
        steps.pixAutomaticoRead = { path: p.split("?")[0], status: resp.status, ok: true, bodyPreview: text.slice(0, 300) };
      }
    } catch (e) {
      readAttempts.push({ path: p.split("?")[0], error: e instanceof Error ? e.message : String(e) });
    }
  }
  steps.readAttempts = readAttempts;
  if (!steps.pixAutomaticoRead) {
    steps.pixAutomaticoRead = { ok: false, note: "Nenhum caminho de recorrência respondeu 2xx — ver readAttempts." };
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
