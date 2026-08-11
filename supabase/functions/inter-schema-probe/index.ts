// Edge function: inter-schema-probe
// Descobre o SHAPE real dos payloads de Pix Automático do Inter perguntando à
// própria API: o Bacen responde 400 com `violacoes[]` listando campo por campo o
// que falta ou está errado. Body vazio nunca cria recorrência nem cobrança, então
// a sonda é segura — e mais confiável que documentação de terceiro.
//
// Uso: GET ?probe=rec|solicrec|cobr|webhook|all
import { interFetch, buildTxid } from "../_shared/inter-pix.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const which = url.searchParams.get("probe") || "all";
  const results: Record<string, unknown> = {};

  const attempt = async (label: string, path: string, method: string, body?: unknown) => {
    try {
      const r = await interFetch(path, { method, ...(body !== undefined ? { body } : {}) });
      results[label] = { path, method, status: r.status, ok: r.ok, body: r.raw.slice(0, 1500) };
    } catch (e) {
      results[label] = { path, method, error: e instanceof Error ? e.message : String(e) };
    }
  };

  if (which === "rec" || which === "all") {
    // POST com body vazio: a resposta lista os campos obrigatórios da recorrência.
    await attempt("rec_post_empty", "/pix/v2/rec", "POST", {});
    // Body parcial com nomes do Bacen: confirma se os nomes estão certos.
    await attempt("rec_post_partial", "/pix/v2/rec", "POST", {
      vinculo: { contrato: "aura-probe", devedor: { cpf: "00000000000", nome: "Probe" }, objeto: "Probe Aura" },
      calendario: { dataInicial: "2099-01-01", periodicidade: "MENSAL" },
      valor: { valorRec: "1.00" },
      politicaRetentativa: "PERMITE_3R_7D",
      ativacao: {},
    });
  }

  if (which === "solicrec" || which === "all") {
    await attempt("solicrec_post_empty", "/pix/v2/solicrec", "POST", {});
  }

  if (which === "cobr" || which === "all") {
    const txid = buildTxid("probe");
    await attempt("cobr_put_empty", `/pix/v2/cobr/${txid}`, "PUT", {});
  }

  if (which === "webhook" || which === "all") {
    // GET de webhook: mostra se já existe webhook registrado e o formato.
    await attempt("webhookrec_get", "/pix/v2/webhookrec", "GET");
    await attempt("webhookcobr_get", "/pix/v2/webhookcobr", "GET");
  }

  return new Response(JSON.stringify(results, null, 2), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
