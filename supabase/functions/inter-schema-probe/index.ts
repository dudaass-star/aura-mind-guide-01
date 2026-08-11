// Edge function: inter-schema-probe
// Descobre o SHAPE real dos payloads de Pix Automático do Inter perguntando à
// própria API: o Bacen responde 400 com `violacoes[]` listando campo por campo o
// que falta ou está errado. Body vazio nunca cria recorrência nem cobrança, então
// a sonda é segura — e mais confiável que documentação de terceiro.
//
// Uso: GET ?probe=rec|solicrec|cobr|webhook|all
import { interFetch, buildTxid, brtDate } from "../_shared/inter-pix.ts";

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

  if (which === "cob" || which === "all") {
    // Jornada 2: precisamos de um `loc` (payload location) e de um `cob` imediato.
    await attempt("loc_post_empty", "/pix/v2/loc", "POST", {});
    await attempt("loc_post_cob", "/pix/v2/loc", "POST", { tipoCob: "cob" });
    await attempt("cob_put_empty", `/pix/v2/cob/${buildTxid("probec")}`, "PUT", {});
  }

  // Ensaio completo da Jornada 2 com valor mínimo. Cria um `loc`, um `cob`
  // imediato e a `rec` amarrada a ele. Ninguém paga e ninguém autoriza — a
  // recorrência morre em CRIADA. Serve para validar TODOS os campos de uma vez.
  if (which === "jornada2") {
    const chave = Deno.env.get("INTER_PIX_KEY");
    if (!chave) {
      results.erro = "INTER_PIX_KEY ausente";
    } else {
      const loc = await interFetch<{ id: number; location: string }>("/pix/v2/loc", {
        method: "POST",
        body: { tipoCob: "cob" },
      });
      results.loc = { status: loc.status, body: loc.raw };
      const locId = loc.data?.id;
      // A `rec` exige um payload location PRÓPRIO (locrec), diferente do loc do cob.
      const locRec = await interFetch<{ id: number; location: string }>("/pix/v2/locrec", {
        method: "POST",
      });
      results.locrec = { status: locRec.status, body: locRec.raw };
      const locRecId = locRec.data?.id;
      const txid = buildTxid("auraprobe");
      const cobBody = {
        calendario: { expiracao: 86400 },
        devedor: { cpf: "11144477735", nome: "Cliente Teste Aura" },
        valor: { original: "1.00" },
        chave,
        solicitacaoPagador: "Aura - teste de integracao",
        ...(locId ? { loc: { id: locId } } : {}),
      };
      await attempt("cob_put", `/pix/v2/cob/${txid}`, "PUT", cobBody);

      const dataInicial = brtDate(new Date(Date.now() + 8 * 864e5));
      const recBody = {
        vinculo: {
          contrato: `auraprobe${Date.now().toString(36)}`,
          devedor: { cpf: "11144477735", nome: "Cliente Teste Aura" },
          objeto: "Assinatura Aura (teste)",
        },
        calendario: { dataInicial, periodicidade: "MENSAL" },
        valor: { valorRec: "1.00" },
        politicaRetentativa: "PERMITE_3R_7D",
        ...(locRecId ? { loc: locRecId } : {}),
        ativacao: { dadosJornada: { txid } },
      };
      await attempt("rec_post", "/pix/v2/rec", "POST", recBody);
      results.txidUsado = txid;
    }
  }

  // Inspeciona uma rec existente (QR composto) e limpa artefatos de teste.
  // Jornada 1: QR ÚNICO de cobrança que já carrega o mandato (`idRec`).
  // Sonda os nomes de campo possíveis; o Bacen devolve `violacoes[]` dizendo
  // qual existe. É assim que descobrimos o contrato real sem documentação.
  if (which === "jornada1") {
    const chave = Deno.env.get("INTER_PIX_KEY")!;
    const idRec = url.searchParams.get("idRec") || "";
    const base = {
      calendario: { expiracao: 86400 },
      devedor: { cpf: "11144477735", nome: "Cliente Teste Aura" },
      valor: { original: "1.00" },
      chave,
      solicitacaoPagador: "Aura - sonda jornada 1",
    };
    for (const [label, extra] of [
      ["idRec_raiz", { idRec }],
      ["recorrencia_obj", { recorrencia: { idRec } }],
      ["rec_obj", { rec: { idRec } }],
      ["calendario_idRec", { calendario: { expiracao: 86400, idRec } }],
    ] as [string, Record<string, unknown>][]) {
      await attempt(label, `/pix/v2/cob/${buildTxid("aurasonda")}`, "PUT", { ...base, ...extra });
    }
  }

  if (which === "inspect") {
    const idRec = url.searchParams.get("idRec") || "";
    const txid = url.searchParams.get("txid") || "";
    if (idRec) await attempt("rec_get", `/pix/v2/rec/${idRec}`, "GET");
    if (txid) await attempt("cob_get", `/pix/v2/cob/${txid}`, "GET");
    if (url.searchParams.get("cleanup") === "1") {
      if (idRec) await attempt("rec_cancel", `/pix/v2/rec/${idRec}`, "PATCH", { status: "CANCELADA" });
      if (txid) await attempt("cob_remove", `/pix/v2/cob/${txid}`, "PATCH", { status: "REMOVIDA_PELO_USUARIO_RECEBEDOR" });
    }
  }

  // Registra as três rotas de notificação do Inter apontando para webhook-inter.
  if (which === "register") {
    const chave = Deno.env.get("INTER_PIX_KEY");
    const base = `${Deno.env.get("SUPABASE_URL")}/functions/v1/webhook-inter`;
    await attempt("reg_webhookrec", "/pix/v2/webhookrec", "PUT", { webhookUrl: base });
    await attempt("reg_webhookcobr", "/pix/v2/webhookcobr", "PUT", { webhookUrl: base });
    if (chave) await attempt("reg_webhook_pix", `/pix/v2/webhook/${chave}`, "PUT", { webhookUrl: base });
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
