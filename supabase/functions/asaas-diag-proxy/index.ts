// TEMPORÁRIO — diagnóstico da credencial Asaas. Não expõe a chave: devolve só
// ambiente, tamanho da chave e os status HTTP das chamadas de verificação.
Deno.serve(async () => {
  const key = Deno.env.get("ASAAS_API_KEY") || "";
  const env = (Deno.env.get("ASAAS_ENV") || "sandbox").toLowerCase();
  const base = env === "production" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";
  const probe = async (b: string) => {
    try {
      const r = await fetch(`${b}/myAccount`, {
        headers: { access_token: key, "Content-Type": "application/json", "User-Agent": "Aura/1.0" },
      });
      const t = await r.text();
      return { base: b, status: r.status, bodyPreview: t.slice(0, 300) };
    } catch (e) {
      return { base: b, status: 0, bodyPreview: (e as Error).message };
    }
  };
  return new Response(
    JSON.stringify(
      {
        env,
        keyLength: key.length,
        keyPrefixKind: key.startsWith("$aact_prod") ? "prod" : key.startsWith("$aact_hmlg") ? "sandbox" : key.startsWith("$aact_") ? "aact_outro" : "desconhecido",
        configured: await probe(base),
        alternate: await probe(
          base.includes("sandbox") ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3",
        ),
      },
      null,
      2,
    ),
    { headers: { "Content-Type": "application/json" } },
  );
});
