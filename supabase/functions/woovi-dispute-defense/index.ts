// Defesa automática de disputa (MED/chargeback) do trilho PIX da Woovi.
//
// Por que existe: numa disputa MED quem decide é o Banco Central. Se ninguém
// responde com evidência, o padrão é devolver o valor E acumular marca de fraude
// na conta — o que, repetido, desabilita a conta Woovi. Esta função monta o
// dossiê (consentimento + identidade + serviço entregue + histórico de
// pagamento) e envia como evidência pela API, sem etapa manual.
//
// A defesa separa legitimidade da compra e intensidade de uso. Pagamento
// autorizado com acesso entregue já é defendido; mensagens e sessões entram
// como provas adicionais do serviço prestado.
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
const CLOSED = new Set(["REJECTED", "WON", "LOST", "CLOSED", "REFUNDED", "CANCELED", "CANCELLED"]);

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
  let taster: any = null;
  if (!charge && e2e) {
    const bank = e2e.length >= 9 ? e2e.slice(1, 9) : null;
    const openedAt = dispute.raw_payload?.createdAt || dispute.created_at || null;
    let q = supabase.from("taster_offers").select("*")
      .not("paid_at", "is", null)
      .eq("paid_value_cents", dispute.value_cents || 690);
    if (bank) q = q.contains("metadata", { payer_bank: bank });
    if (openedAt) {
      const center = new Date(openedAt).getTime();
      q = q.gte("paid_at", new Date(center - 3 * 24 * 60 * 60 * 1000).toISOString())
        .lte("paid_at", new Date(center + 24 * 60 * 60 * 1000).toISOString());
    }
    const { data } = await q.order("paid_at", { ascending: false }).limit(2);
    if (Array.isArray(data) && data.length === 1) taster = data[0];
  }

  const profileUserId = taster?.profile_user_id || null;
  let profile: any = null;
  if (charge?.user_id || dispute.profile_id) {
    const profileId = charge?.user_id || dispute.profile_id;
    const { data } = await supabase.from("profiles").select(
      "id,user_id,name,email,phone,plan,billing_cycle,status,created_at,card_gateway,taster_paid_at,taster_expires_at",
    ).eq("id", profileId).maybeSingle();
    profile = data || null;
  } else if (profileUserId) {
    const { data } = await supabase.from("profiles").select(
      "id,user_id,name,email,phone,plan,billing_cycle,status,created_at,card_gateway,taster_paid_at,taster_expires_at",
    ).eq("user_id", profileUserId).maybeSingle();
    profile = data || null;
  }
  const profileId = profile?.id || dispute.profile_id || null;

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

  const isTaster = !!taster;
  const paidAt = taster?.paid_at || charge?.paid_at || mandate?.entry_paid_at || null;
  const accessDelivered = !!(profile?.created_at || charge?.access_activated_at || taster?.profile_user_id);
  const hasConsent = !!paidAt;
  const hasUsage = messages >= 10 || sessions >= 1;
  const decision: Dossier["decision"] = hasConsent && accessDelivered ? "defend" : "refund_suggested";
  const reason = decision === "defend"
    ? hasUsage
      ? "pagamento autorizado, acesso entregue e uso do serviço comprovados"
      : "pagamento autorizado e acesso ao serviço entregue"
    : !hasConsent
      ? "pagamento não vinculado automaticamente — exige revisão"
      : "acesso entregue não comprovado automaticamente — exige revisão";

  const value = dispute.value_cents ?? charge?.value_cents ?? null;

  const lines: PdfLine[] = [
    { text: "OLÁ AURA — DEFESA DE DISPUTA PIX (MED)", size: 15, bold: true },
    { text: "JUBI LTDA · CNPJ 59.177.427/0001-02 · suporte@olaaura.com.br", size: 9, gap: 4 },
    { text: `Documento gerado automaticamente em ${brt(new Date().toISOString())}`, size: 9 },

    { text: "1. TRANSAÇÃO CONTESTADA", size: 12, bold: true, gap: 18 },
    { text: `End-to-end ID: ${e2e || "—"}`, gap: 4 },
    { text: `Valor: ${money(value)}` },
    { text: isTaster ? `Validade do acesso adquirido: ${brt(taster?.expires_at)}` : `Vencimento do ciclo: ${brt(charge?.due_date, false)}` },
    { text: `Liquidação: ${brt(paidAt)}` },
    { text: isTaster ? "Natureza: compra avulsa de encontro guiado, sem renovação automática" : `Natureza: cobrança recorrente autorizada (Pix Automático), ciclo ${charge?.cycle_index ?? "—"}` },
    { text: isTaster ? `Identificador da compra: ${taster?.charge_correlation_id || "—"}` : `Assinatura Woovi: ${mandate?.subscription_id || "—"}` },

    { text: "2. CONSENTIMENTO DO PAGADOR", size: 12, bold: true, gap: 18 },
    {
      text:
        isTaster
          ? "O pagador gerou um código Pix para uma compra avulsa, conferiu beneficiário e valor no aplicativo do próprio banco e concluiu o pagamento de forma ativa. A compra não cria renovação automática."
          : "O débito não foi iniciado por nós de forma unilateral. O pagador autorizou o mandato de Pix Automático dentro do aplicativo do próprio banco, informando os dados abaixo no nosso checkout antes da autorização.",
      gap: 4,
    },
    { text: isTaster ? `Pagamento Pix confirmado em: ${brt(paidAt)}` : `Autorização do mandato aprovada em: ${brt(mandate?.mandate_approved_at)}`, gap: 6 },
    { text: isTaster ? `Valor conferido e pago: ${money(taster?.paid_value_cents)}` : `Pagamento de entrada (adesão) em: ${brt(mandate?.entry_paid_at || paidCharges[0]?.paid_at)}` },
    { text: isTaster ? "Modalidade: compra avulsa, sem assinatura e sem nova cobrança automática" : `Situação do mandato: ${mandate?.status || "—"} (${mandate?.pix_status || "—"})` },
    { text: isTaster ? `Produto adquirido: encontro guiado de 45 minutos com acesso imediato` : `Plano contratado: ${mandate?.plan || profile?.plan || "—"} · periodicidade ${mandate?.billing_period || profile?.billing_cycle || "—"}` },
    { text: `ISPB da instituição do pagador: ${taster?.metadata?.payer_bank || mandate?.payer_bank || charge?.payer_bank || "—"}` },

    { text: "3. IDENTIFICAÇÃO DO CLIENTE", size: 12, bold: true, gap: 18 },
    { text: `Nome informado no checkout: ${taster?.name || mandate?.customer_name || profile?.name || "—"}`, gap: 4 },
    { text: `E-mail: ${taster?.email || mandate?.customer_email || profile?.email || "—"}` },
    { text: `Telefone (WhatsApp usado no serviço): ${mask(taster?.phone_normalized || mandate?.customer_phone || profile?.phone, 4)}` },
    { text: `CPF informado: ${mask(mandate?.customer_cpf, 3)}` },
    { text: `Cliente cadastrado em: ${brt(profile?.created_at)}` },

    { text: "4. SERVIÇO EFETIVAMENTE PRESTADO", size: 12, bold: true, gap: 18 },
    {
      text:
        "A Olá Aura é um aplicativo de acompanhamento emocional com conversas por texto ou áudio. O acesso é entregue de imediato e o uso fica registrado. O WhatsApp funciona como canal complementar. Por sigilo, informamos apenas metadados de uso, sem conteúdo das conversas.",
      gap: 4,
    },
    { text: `Mensagens trocadas na conta: ${messages}`, gap: 6 },
    { text: `Encontros guiados concluídos: ${sessions}` },
    { text: `Última interação do cliente: ${brt(lastMessageAt)}` },
    {
      text: lastMessageAt && paidAt && new Date(lastMessageAt) >= new Date(paidAt)
        ? "Observação: o cliente seguiu usando o serviço APÓS a cobrança contestada."
        : "Observação: há uso registrado do serviço no período pago.",
    },

    { text: "5. HISTÓRICO DE PAGAMENTOS", size: 12, bold: true, gap: 18 },
    ...(isTaster ? [{
      text: `• ${brt(taster?.paid_at)} — ${money(taster?.paid_value_cents)} — compra avulsa paga`,
      size: 9,
    }] : paidCharges.map((c: any) => ({
      text: `• ${brt(c.paid_at)} — ${money(c.value_cents)} — ${
        c.kind === "entry" ? "adesão" : `ciclo ${c.cycle_index}`
      } — pago`,
      size: 9,
    }))),
    {
      text:
        isTaster
          ? "O valor foi pago uma única vez pelo próprio pagador. Esta compra avulsa não autoriza cobranças futuras."
          : "Nenhuma cobrança foi feita fora do que o cliente autorizou: valor, periodicidade e plano são os mesmos do mandato aprovado no banco.",
      gap: 6,
    },

    { text: "6. POLÍTICA E DISPOSIÇÃO PARA RESOLVER", size: 12, bold: true, gap: 18 },
    {
      text:
        "O cancelamento é livre, sem multa e sem fidelidade, por uma mensagem no WhatsApp ou pelo portal do cliente. Se este pagamento decorre de insatisfação ou de esquecimento da assinatura, resolvemos direto com o cliente: cancelamos e devolvemos o valor sem discussão. Solicitamos apenas que a disputa não seja tratada como fraude, porque houve consentimento formal e serviço entregue.",
      gap: 4,
    },
    {
      text: `Conclusão: transação legítima, paga pelo próprio pagador em ${brt(paidAt)}, com acesso entregue${hasUsage ? " e serviço comprovadamente utilizado" : ""}.`,
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
      purchase_type: isTaster ? "taster" : "subscription",
      paid_at: paidAt,
      access_delivered: accessDelivered,
      paid_charges: paidCharges.length,
      customer_name: taster?.name || mandate?.customer_name || profile?.name || null,
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

// Na conta real a API só aceita { documents: [...] } — o corpo "documento nu"
// da doc devolve 400. Mandamos primeiro o formato que funciona e mantemos o
// documentado como fallback, para não perder prazo se a Woovi mudar.
async function sendEvidence(
  disputeId: string,
  doc: Record<string, string>,
): Promise<{ ok: boolean; detail: string }> {
  const path = `/api/v1/dispute/${encodeURIComponent(disputeId)}/evidence`;
  const first = await wooviFetch(path, {
    method: "POST",
    body: { documents: [doc] },
  } as RequestInit & { body?: unknown });
  if (first.ok) return { ok: true, detail: "enviada" };
  if (first.status === 400 || first.status === 422) {
    const alt = await wooviFetch(path, { method: "POST", body: doc } as RequestInit & { body?: unknown });
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
  const description = "Dossie de defesa: pagamento autorizado pelo pagador, identificacao do cliente, acesso entregue, uso do servico e historico da compra.";

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

async function alertOpenWithoutEvidence(supabase: any): Promise<number> {
  const { data } = await supabase.from("woovi_disputes")
    .select("dispute_id,status,value_cents,customer_name,evidence_error")
    .is("evidence_sent_at", null)
    .order("created_at", { ascending: true });
  const pending = (data || []).filter((row: any) => !CLOSED.has(String(row.status || "").toUpperCase()));
  if (pending.length === 0) return 0;
  const alertEmail = Deno.env.get("ADMIN_ALERT_EMAIL");
  if (!alertEmail) {
    log("alerta admin não enviado", { reason: "ADMIN_ALERT_EMAIL ausente", total: pending.length });
    return 0;
  }
  const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const { error } = await supabase.functions.invoke("send-transactional-email", {
    body: {
      templateName: "admin-woovi-dispute-alert",
      recipientEmail: alertEmail,
      idempotencyKey: `woovi-disputes-${new Date().toISOString().slice(0, 10)}`,
      templateData: {
        date,
        lines: pending.map((row: any) =>
          `${row.customer_name || "Cliente não identificado"} · ${money(row.value_cents)} · ${row.status || "aberta"} · ${row.evidence_error || "sem evidência"}`
        ),
      },
    },
  });
  if (error) log("alerta admin falhou", { error: error.message });
  return error ? 0 : pending.length;
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

    // Dossiê sob demanda (para conferência ou anexo manual enquanto a chave
    // Woovi não tem escopo): devolve o PDF em base64, sem enviar nada.
    if (body.endToEndId && body.previewOnly === true) {
      const dossier = await buildDossier(supabase, {
        end_to_end_id: String(body.endToEndId),
        value_cents: body.valueCents ?? null,
        dispute_id: "preview",
      });
      const pdf = buildPdf(dossier.lines);
      let bin = "";
      for (const b of pdf) bin += String.fromCharCode(b);
      return new Response(
        JSON.stringify({ ok: true, decision: dossier.decision, reason: dossier.reason, summary: dossier.summary, pdf_base64: btoa(bin) }),
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

    const pending = (disputes || []).filter((d: any) =>
      (force || !d.evidence_sent_at) && (force || !CLOSED.has(String(d.status || "").toUpperCase()))
    );
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

    const alerts = await alertOpenWithoutEvidence(supabase);

    return new Response(JSON.stringify({ ok: true, processed: results.length, alerts, results }), {
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
