/**
 * Tradução dos avisos de débito do PIX Automático (Woovi) para o formato de
 * cobrança paga que o webhook-woovi já processa.
 *
 * Causa raiz que motivou este arquivo (16/10/2026): a mensalidade debitada no
 * banco do cliente chega como TRANSAÇÃO (`subType: PIX_AUTOMATIC`) ou como
 * objeto `cobr`/`installment` — nunca em `body.charge`. O receptor só lia
 * `body.charge`, então o dinheiro entrava e o aviso era descartado em silêncio.
 *
 * Chave única: o `transactionID` da transação é o MESMO `cobr.identifierId` da
 * parcela — a chave que a auditoria já grava em `woovi_charges.installment_id`.
 * Assim webhook, replay da auditoria e reenvios convergem na mesma linha.
 */

export interface RecurringPaymentNotice {
  /** `cobr.identifierId` da parcela (= transactionID da transação). */
  cobrId: string;
  endToEndId: string | null;
  valueCents: number;
  paidAt: string;
  payerCpf: string | null;
  recurrencyId: string | null;
}

const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

// deno-lint-ignore no-explicit-any
type Obj = Record<string, any>;

/** Lê um aviso de débito recorrente em qualquer envelope conhecido. */
export function extractRecurringPayment(body: Obj): RecurringPaymentNotice | null {
  const candidates: Obj[] = [body?.transaction, body?.pix, body?.cobr, body?.installment?.cobr, body]
    .filter((c) => c && typeof c === "object");
  for (const t of candidates) {
    const subType = String(t?.subType || "").toUpperCase();
    const isCobr = !!t?.identifierId && !!t?.recurrencyId;
    if (subType !== "PIX_AUTOMATIC" && !isCobr) continue;
    const cobrId = String(t?.identifierId || t?.transactionID || "");
    if (!cobrId) continue;
    // Transação/cobr ainda não liquidada não é dinheiro.
    const status = String(t?.status || "").toUpperCase();
    if (status && !["CONFIRMED", "COMPLETED", "CONCLUDED", "PAID"].includes(status)) continue;
    const cpf = digits(t?.payer?.taxID?.taxID || t?.debitParty?.holder?.taxID?.taxID || t?.taxID);
    return {
      cobrId,
      endToEndId: t?.endToEndId ? String(t.endToEndId) : null,
      valueCents: Number(t?.value || 0),
      paidAt: String(t?.paymentDate || t?.time || t?.createdAt || new Date().toISOString()),
      payerCpf: cpf || null,
      recurrencyId: t?.recurrencyId ? String(t.recurrencyId) : null,
    };
  }
  return null;
}

/**
 * Parcela remota correspondente ao aviso, já liquidada. É a confirmação na
 * fonte: payload forjado não tem parcela CONCLUDED com o mesmo identificador.
 */
export function findPaidInstallment(installments: Obj[], cobrId: string): Obj | null {
  for (const i of installments || []) {
    const cobr = (i?.cobr || {}) as Obj;
    const ids = [cobr?.identifierId, cobr?.endToEndId, ...(cobr?.tries || []).map((t: Obj) => t?.endToEndId)];
    if (!ids.filter(Boolean).map(String).includes(cobrId)) continue;
    const st = [i?.status, cobr?.status].map((s) => String(s || "").toUpperCase());
    const paidTry = (cobr?.tries || []).some((t: Obj) => String(t?.tryStatus || "").toUpperCase() === "PAID");
    if (st.some((s) => ["COMPLETED", "CONCLUDED", "PAID", "CONFIRMED"].includes(s)) || paidTry) return i;
  }
  return null;
}
