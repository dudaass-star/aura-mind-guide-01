// Defesa automática de disputa (MED/chargeback) do trilho PIX da Woovi.
//
// Por que existe: numa disputa MED quem decide é o Banco Central. Se ninguém
// responde com evidência, o padrão é devolver o valor E acumular marca de fraude
// na conta — o que, repetido, desabilita a conta Woovi. Esta função monta o
// dossiê (consentimento + identidade + serviço entregue + histórico de
// pagamento) e envia como evidência pela API, sem etapa manual.
//
// Regra de conduta gravada em código: cliente que de fato NÃO usou o serviço não
// é defendido. Marcamos `defense_decision = 'refund_suggested'` e deixamos para
// devolução. Brigar em caso perdido é o que suja a reputação da conta.
//
// Doc: https://developers.woovi.com/docs/disputa/how-add-new-evidence-in-dispute
//      https://developers.woovi.com/docs/arquivos/upload-de-arquivo
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { WOOVI_API_BASE, wooviFetch } from "../_shared/woovi.ts";
import { buildPdf, type PdfLine } from "./pdf.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, detail?: unknown) =>
  console.log(`[dispute-defense] ${step}${detail !== undefined ? ` - ${JSON.stringify(detail)}` : ""}`);

const BUCKET = "dispute-evidence";
const PAID = ["COMPLETED", "PAID", "CONFIRMED"];

/** Data/hora em BRT — padrão absoluto do projeto. */
function brt(v: string | null | undefined, withTime = true): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(d) + (withTime ? " (horário de Brasília)" : "");
}

const money = (cents: number | null | undefined) =>
  typeof cents === "number" ? `R$ ${(cents / 100).toFixed(2).replace(".", ",")}` : "—";

const mask = (s: string | null | undefined, keep = 3) => {
  const v = String(s || "");
  if (!v) return "—";
  return v.length <= keep * 2 ? v : `${v.slice(0, keep)}${"*".repeat(Math.max(3, v.length - keep * 2))}${v.slice(-keep)}`;
};

// ---------------------------------------------------------------------------
// Coleta de provas
// ---------------------------------------------------------------------------
interface Dossier {
  lines: PdfLine[];
  summary: Record<string, unknown>;
  decision: "defend" | "refund_suggested";
  reason: string;
}

async function buildDossier(supabase: any, dispute: any): Promise<Dossier> {
  const e2e = dispute.end_to_end_id as string | null;

  // 1) A cobrança contestada. O endToEndId do Bacen é o installment_id que já
  //    gravamos quando o débito do ciclo liquidou.
  let charge: any = null;
  if (e2e) {
    const { data } = await supabase.from("woovi_charges").select("*")
      .eq("installment_id", e2e).maybeSingle();
    charge = data || null;
  }
  if (!charge && dispute.value_cents) {
    // Fallback: valor + pagamento recente, quando o e2e não casa (avulso antigo).
    const { data } = await supabase.from("woovi_charges").select("*")
      .eq("value_cents", dispute.value_cents).in("status", PAID)
      .order("paid_at", { ascending: false }).limit(1);
    charge = Array.isArray(data) ? data[0] || null : null;
  }

  const profileId = charge?.user_id || dispute.profile_id || null;

  const { data: profile } = profileId
    ? await supabase.from("profiles").select(
      "id,user_id,name,email,phone,plan,billing_cycle,status,created_at,card_gateway",
    ).eq("id", profileId).maybeSingle()
    : { data: null };

  const { data: sub } = profileId
    ? await supabase.from("woovi_subscriptions").select(
      "subscription_id,plan,billing_period,value_cents,status,pix_status,mandate_approved_at,entry_paid_at,customer_name,customer_email,customer_phone,customer_cpf,payer_bank,created_at,start_date",
    ).eq("user_id", profileId).order("created_at", { ascending: false }).limit(1)
    : { data: null };
  const mandate = Array.isArray(sub) ? sub[0] || null : null;

  const { data: charges } = profileId
    ? await supabase.from("woovi_charges").select("kind,value_cents,status,due_date,paid_at,cycle_index")
      .eq("user_id", profileId).order("created_at", { ascending: true })
    : { data: [] };
  const paidCharges = (charges || []).filter((c: any) => PAID.includes(String(c.status).toUpperCase()));

  const authUserId = profile?.user_id || null;
  const [{ count: msgCount }, lastMsg, { count: sessionCount }] = await Promise.all([
    authUserId
      ? supabase.from("messages").select("id", { count: "exact", head: true }).eq("user_id", authUserId)
      : Promise.resolve({ count: 0 }),
    authUserId
      ? supabase.from("messages").select("created_at").eq("user_id", authUserId)
        .order("created_at", { ascending: false }).limit(1)
      : Promise.resolve({ data: [] }),
    authUserId
      ? supabase.from("sessions").select("id", { count: "exact", head: true })
        .eq("user_id", authUserId).eq("status", "completed")
      : Promise.resolve({ count: 0 }),
  ]);
  const lastMessageAt = Array.isArray(lastMsg?.data) ? lastMsg.data[0]?.created_at || null : null;
  const messages = Number(msgCount || 0);
  const sessions = Number(sessionCount || 0);

  // Decisão: só defendemos com consentimento registrado E uso real do serviço.
  const hasConsent = !!(mandate?.mandate_approved_at || charge?.paid_at);
  const hasUsage = messages >= 10 || sessions >= 1;
  const decision: Dossier["decision"] = hasConsent && hasUsage ? "defend" : "refund_suggested";
  const reason = decision === "defend"
    ? "consentimento e uso do serviço comprovados"
    : !hasConsent
      ? "sem registro de autorização — não defender"
      : "sem uso relevante do serviço — sugerir devolução";

  const value = dispute.value_cents ?? charge?.value_cents ?? null;

  const lines: PdfLine[] = [
    { text: "OLÁ AURA — DEFESA DE DISPUTA PIX (MED)", size: 15, bold: true },
    { text: "JUBI LTDA · CNPJ 59.177.427/0001-02 · suporte@olaaura.com.br", size: 9, gap: 4 },
    { text: `Documento gerado automaticamente em ${brt(new Date().toISOString())}`, size: 9 },

    { text: "1. TRANSAÇÃO CONTESTADA", size: 12, bold: true, gap: 18 },
    { text: `End-to-end ID: ${e2e || "—"}`, gap: 4 },
    { text: `Valor: ${money(value)}` },
    { text: `Vencimento do ciclo: ${brt(charge?.due_date, false)}` },
    { text: `Liquidação: ${brt(charge?.paid_at)}` },
    { text: `Natureza: cobrança recorrente autorizada (Pix Automático), ciclo ${charge?.cycle_index ?? "—"}` },
    { text: `Assinatura Woovi: ${mandate?.subscription_id || "—"}` },

    { text: "2. CONSENTIMENTO DO PAGADOR", size: 12, bold: true, gap: 18 },
    {
      text:
        "O débito não foi iniciado por nós de forma unilateral. O pagador autorizou o mandato de Pix Automático dentro do aplicativo do próprio banco, informando os dados abaixo no nosso checkout antes da autorização.",
      gap: 4,
    },
    { text: `Autorização do mandato aprovada em: ${brt(mandate?.mandate_approved_at)}`, gap: 6 },
    { text: `Pagamento de entrada (adesão) em: ${brt(mandate?.entry_paid_at || paidCharges[0]?.paid_at)}` },
    { text: `Situação do mandato: ${mandate?.status || "—"} (${mandate?.pix_status || "—"})` },
    { text: `Plano contratado: ${mandate?.plan || profile?.plan || "—"} · periodicidade ${mandate?.billing_period || profile?.billing_cycle || "—"}` },
    { text: `Valor autorizado por ciclo: ${money(mandate?.value_cents)}` },
    { text: `ISPB da instituição do pagador: ${mandate?.payer_bank || charge?.payer_bank || "—"}` },

    { text: "3. IDENTIFICAÇÃO DO CLIENTE", size: 12, bold: true, gap: 18 },
    { text: `Nome informado no checkout: ${mandate?.customer_name || profile?.name || "—"}`, gap: 4 },
    { text: `E-mail: ${mandate?.customer_email || profile?.email || "—"}` },
    { text: `Telefone (WhatsApp usado no serviço): ${mask(mandate?.customer_phone || profile?.phone, 4)}` },
    { text: `CPF informado: ${mask(mandate?.customer_cpf, 3)}` },
    { text: `Cliente cadastrado em: ${brt(profile?.created_at)}` },

    { text: "4. SERVIÇO EFETIVAMENTE PRESTADO", size: 12, bold: true, gap: 18 },
    {
      text:
        "A Olá Aura é um serviço de acompanhamento emocional por WhatsApp. O acesso é entregue de imediato e o uso fica registrado. Por sigilo, informamos apenas metadados de uso, sem conteúdo das conversas.",
      gap: 4,
    },
    { text: `Mensagens trocadas na conta: ${messages}`, gap: 6 },
    { text: `Encontros guiados concluídos: ${sessions}` },
    { text: `Última interação do cliente: ${brt(lastMessageAt)}` },
    {
      text: lastMessageAt && charge?.paid_at && new Date(lastMessageAt) >= new Date(charge.paid_at)
        ? "Observação: o cliente seguiu usando o serviço APÓS a cobrança contestada."
        : "Observação: há uso registrado do serviço no período pago.",
    },

    { text: "5. HISTÓRICO DE PAGAMENTOS", size: 12, bold: true, gap: 18 },
    ...paidCharges.map((c: any) => ({
      text: `• ${brt(c.paid_at)} — ${money(c.value_cents)} — ${
        c.kind === "entry" ? "adesão" : `ciclo ${c.cycle_index}`
      } — pago`,
      size: 9,
    })),
    {
      text:
        "Nenhuma cobrança foi feita fora do que o cliente autorizou: valor, periodicidade e plano são os mesmos do mandato aprovado no banco.",
      gap: 6,
    },

    { text: "6. POLÍTICA E DISPOSIÇÃO PARA RESOLVER", size: 12, bold: true, gap: 18 },
    {
      text:
        "O cancelamento é livre, sem multa e sem fidelidade, por uma mensagem no WhatsApp ou pelo portal do cliente. Se este pagamento decorre de insatisfação ou de esquecimento da assinatura, resolvemos direto com o cliente: cancelamos e devolvemos o valor sem discussão. Solicitamos apenas que a disputa não seja tratada como fraude, porque houve consentimento formal e serviço entregue.",
      gap: 4,
    },
    {
      text: `Conclusão: transação legítima, autorizada pelo próprio pagador em ${brt(mandate?.mandate_approved_at)} e com serviço comprovadamente utilizado.`,
      bold: true,
      gap: 10,
    },
  ];

  return {
    lines,
    decision,
    reason,
    summary: {
      e2e,
      value_cents: value,
      profile_id: profileId,
      messages,
      sessions,
      last_message_at: lastMessageAt,
      mandate_approved_at: mandate?.mandate_approved_at || null,
      paid_charges: paidCharges.length,
      customer_name: mandate?.customer_name || profile?.name || null,
      decision,
      reason,
    },
  };
}

// ---------------------------------------------------------------------------
// Envio para a Woovi: arquivo (preferencial) ou URL assinada (fallback)
// ---------------------------------------------------------------------------
async function uploadToWoovi(pdf: Uint8Array, correlationID: string): Promise<
  { fileId: string } | { error: string; code?: string }
> {
  const appId = Deno.env.get("WOOVI_APP_ID");
  if (!appId) return { error: "WOOVI_APP_ID ausente" };
  const form = new FormData();
  form.append("file", new Blob([pdf], { type: "application/pdf" }), `${correlationID}.pdf`);
  form.append("purpose", "DISPUTE_EVIDENCE");
  form.append("correlationID", correlationID);
  const resp = await fetch(`${WOOVI_API_BASE}/api/v1/files`, {
    method: "POST",
    headers: { Authorization: appId },
    body: form,
  });
  const raw = await resp.text();
  if (!resp.ok) {
    log("upload woovi falhou", { status: resp.status, raw: raw.slice(0, 300) });
    let code: string | undefined;
    try {
      code = JSON.parse(raw)?.errorCode;
    } catch { /* corpo não-JSON */ }
    return { error: `files ${resp.status}: ${raw.slice(0, 200)}`, code };
  }
  let fileId = "";
  try {
    const j = JSON.parse(raw);
    fileId = j?.file?.id || j?.id || j?.fileId || "";
  } catch { /* ignora */ }
  return fileId ? { fileId } : { error: "resposta sem id do arquivo" };
}

/** Fallback: guarda o PDF no storage e devolve URL assinada para a Woovi baixar. */
async function uploadToStorage(
  supabase: any,
  pdf: Uint8Array,
  correlationID: string,
): Promise<{ url: string } | { error: string }> {
  const path = `${correlationID}.pdf`;
  const up = await supabase.storage.from(BUCKET).upload(path, pdf, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (up.error) return { error: `storage: ${up.error.message}` };
  const signed = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24 * 7);
  if (signed.error || !signed.data?.signedUrl) {
    return { error: `signed url: ${signed.error?.message || "sem url"}` };
  }
  return { url: signed.data.signedUrl };
}

// A doc mostra o corpo como o próprio documento; contas antigas aceitam a forma
// { documents: [...] }. Tentamos a documentada e caímos na alternativa em 400/422
// para não perder o prazo da disputa por causa de formato.
async function sendEvidence(
  disputeId: string,
  doc: Record<string, string>,
): Promise<{ ok: boolean; detail: string }> {
  const path = `/api/v1/dispute/${encodeURIComponent(disputeId)}/evidence`;
  const first = await wooviFetch(path, { method: "POST", body: doc } as RequestInit & { body?: unknown });
  if (first.ok) return { ok: true, detail: "enviada" };
  if (first.status === 400 || first.status === 422) {
    const alt = await wooviFetch(path, {
      method: "POST",
      body: { documents: [doc] },
    } as RequestInit & { body?: unknown });
    if (alt.ok) return { ok: true, detail: "enviada (formato alternativo)" };
    return { ok: false, detail: `${first.status}: ${first.raw.slice(0, 150)} | alt ${alt.status}: ${alt.raw.slice(0, 150)}` };
  }
  return { ok: false, detail: `${first.status}: ${first.raw.slice(0, 200)}` };
}

async function processDispute(supabase: any, dispute: any) {
  log("processando", { id: dispute.dispute_id, e2e: dispute.end_to_end_id });
  const dossier = await buildDossier(supabase, dispute);

  const base = {
    defense_decision: dossier.decision,
    defense_summary: dossier.summary,
    profile_id: (dossier.summary as any).profile_id || dispute.profile_id,
    customer_name: (dossier.summary as any).customer_name || dispute.customer_name,
    evidence_attempts: (dispute.evidence_attempts || 0) + 1,
  };

  if (dossier.decision !== "defend") {
    await supabase.from("woovi_disputes").update({
      ...base,
      evidence_error: `defesa não enviada: ${dossier.reason}`,
    }).eq("id", dispute.id);
    log("sem defesa", { id: dispute.dispute_id, reason: dossier.reason });
    return { dispute_id: dispute.dispute_id, sent: false, reason: dossier.reason };
  }

  const pdf = buildPdf(dossier.lines);
  const correlationID = `dispute-${dispute.dispute_id}`;
  const description = "Dossie de defesa: autorizacao do Pix Automatico pelo pagador, identificacao do cliente, uso comprovado do servico e historico de pagamentos.";

  let result = { ok: false, detail: "não tentado" };
  const viaWoovi = await uploadToWoovi(pdf, correlationID);
  if ("fileId" in viaWoovi) {
    result = await sendEvidence(dispute.dispute_id, { fileId: viaWoovi.fileId, description, correlationID });
  }
  if (!result.ok) {
    // Conta sem a feature de fileId (ou upload indisponível): manda por URL.
    const viaStorage = await uploadToStorage(supabase, pdf, correlationID);
    if ("url" in viaStorage) {
      result = await sendEvidence(dispute.dispute_id, { url: viaStorage.url, description, correlationID });
    } else {
      result = { ok: false, detail: `${("error" in viaWoovi ? viaWoovi.error : "")} | ${viaStorage.error}` };
    }
  }

  await supabase.from("woovi_disputes").update({
    ...base,
    ...(result.ok
      ? { evidence_sent_at: new Date().toISOString(), evidence_error: null }
      : { evidence_error: result.detail.slice(0, 500) }),
  }).eq("id", dispute.id);

  log(result.ok ? "evidência enviada" : "falha no envio", { id: dispute.dispute_id, detail: result.detail });
  return { dispute_id: dispute.dispute_id, sent: result.ok, detail: result.detail };
}

// ---------------------------------------------------------------------------
// Sincronização: puxa as disputas da Woovi e registra as que não chegaram por
// webhook (disputa aberta antes de existir o handler não tem reenvio).
// ---------------------------------------------------------------------------
async function syncDisputes(supabase: any): Promise<{ found: number; created: number; raw?: string }> {
  const attempts = ["/api/v1/dispute", "/api/v1/disputes"];
  for (const path of attempts) {
    const r = await wooviFetch<Record<string, any>>(path);
    if (!r.ok) {
      log("sync falhou", { path, status: r.status });
      continue;
    }
    const raw = r.data as Record<string, any> | null;
    const list: Record<string, any>[] = Array.isArray(raw?.disputes)
      ? raw!.disputes
      : Array.isArray(raw?.dispute)
        ? raw!.dispute
        : Array.isArray(raw)
          ? (raw as unknown as Record<string, any>[])
          : [];
    let created = 0;
    for (const d of list) {
      const id = d.id || d.globalID || d.disputeId;
      if (!id) continue;
      const { data: existing } = await supabase.from("woovi_disputes")
        .select("id").eq("dispute_id", String(id)).maybeSingle();
      if (existing) {
        await supabase.from("woovi_disputes").update({
          status: String(d.status || "").toUpperCase() || null,
          raw_payload: d,
        }).eq("id", existing.id);
        continue;
      }
      await supabase.from("woovi_disputes").insert({
        dispute_id: String(id),
        dispute_type: String(d.type || "MED").toUpperCase(),
        status: String(d.status || "").toUpperCase() || null,
        end_to_end_id: d.endToEndId || d.endToEndID || null,
        value_cents: Number(d.value ?? d.amount ?? 0) || null,
        customer_name: d.payer?.name || d.customer?.name || null,
        dispute_reason: d.reason || d.description || null,
        raw_payload: d,
      });
      created++;
    }
    log("sync ok", { path, found: list.length, created });
    return { found: list.length, created };
  }
  return { found: 0, created: 0, raw: "nenhum endpoint de listagem de disputa respondeu" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const body = await req.json().catch(() => ({} as Record<string, any>));
    const only = body.disputeId ? String(body.disputeId) : null;
    const force = body.force === true;
    const dryRun = body.dryRun === true;

    // Diagnóstico de permissões da chave Woovi: sem escopo não há defesa.
    if (body.probe === true) {
      const list = await wooviFetch("/api/v1/dispute");
      const up = await uploadToWoovi(buildPdf([{ text: "teste de permissao" }]), `probe-${Date.now()}`);
      return new Response(
        JSON.stringify({
          ok: true,
          dispute_get_list: { status: list.status, raw: list.raw.slice(0, 200) },
          file_upload: up,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }


    // Sem disputa específica: varre a Woovi antes, para pegar o que não veio por
    // webhook. Com disputa específica o webhook já gravou.
    let sync: unknown = null;
    if (!only) sync = await syncDisputes(supabase);

    if (dryRun) {
      const { data: rows } = await supabase.from("woovi_disputes")
        .select("dispute_id,status,end_to_end_id,value_cents,evidence_sent_at,defense_decision,evidence_error")
        .order("created_at", { ascending: false }).limit(20);
      return new Response(JSON.stringify({ ok: true, dryRun: true, sync, disputes: rows || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let q = supabase.from("woovi_disputes").select("*");
    if (only) q = q.eq("dispute_id", only);
    else q = q.is("evidence_sent_at", null).lt("evidence_attempts", 5);
    const { data: disputes, error } = await q.order("created_at", { ascending: true }).limit(20);
    if (error) throw new Error(error.message);

    const pending = (disputes || []).filter((d: any) => force || !d.evidence_sent_at);
    log("disputas para tratar", { total: pending.length });

    const results = [];
    for (const d of pending) {
      try {
        results.push(await processDispute(supabase, d));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log("ERRO", { id: d.dispute_id, msg });
        await supabase.from("woovi_disputes").update({
          evidence_error: msg.slice(0, 500),
          evidence_attempts: (d.evidence_attempts || 0) + 1,
        }).eq("id", d.id);
        results.push({ dispute_id: d.dispute_id, sent: false, detail: msg });
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log("ERRO GERAL", { msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
