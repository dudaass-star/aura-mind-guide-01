import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractRecurringPayment, findPaidInstallment } from "./woovi-recurring-payment.ts";

// Transação real do extrato (Jilvania, 16/10/2026), anonimizada no CPF.
const tx = {
  value: 2990, time: "2026-10-16T05:07:05.890Z",
  endToEndId: "E54811417202610161500LHBHK8vfrKX",
  transactionID: "01M4TJJHXSQJ2BA2NE7P2RBZAH",
  status: "CONFIRMED", type: "PAYMENT", subType: "PIX_AUTOMATIC",
  payer: { taxID: { taxID: "04843172537" } },
};
const installments = [
  { status: "COMPLETED", cobr: { identifierId: "01M29VS2KHX5WK3ZQZRVAAC43V", status: "CONCLUDED" } },
  { status: "COMPLETED", cobr: { identifierId: "01M4TJJHXSQJ2BA2NE7P2RBZAH", status: "CONCLUDED",
    tries: [{ tryStatus: "PAID", endToEndId: "E54811417202610161500LHBHK8vfrKX" }] } },
  { status: "SCHEDULED", cobr: null },
];

Deno.test("débito recorrente via TRANSACTION_RECEIVED vira a chave da parcela", () => {
  const n = extractRecurringPayment({ event: "OPENPIX:TRANSACTION_RECEIVED", pix: tx });
  assertEquals(n?.cobrId, "01M4TJJHXSQJ2BA2NE7P2RBZAH");
  assertEquals(n?.valueCents, 2990);
  assertEquals(n?.payerCpf, "04843172537");
});

Deno.test("pagamento de cobrança avulsa não é tratado como mensalidade", () => {
  assertEquals(extractRecurringPayment({ pix: { ...tx, subType: "CHARGE_PAYMENT" } }), null);
});

Deno.test("transação não liquidada não conta como dinheiro", () => {
  assertEquals(extractRecurringPayment({ transaction: { ...tx, status: "PENDING" } }), null);
});

Deno.test("só confirma parcela concluída com o mesmo identificador", () => {
  assertEquals(findPaidInstallment(installments, "01M4TJJHXSQJ2BA2NE7P2RBZAH") !== null, true);
  assertEquals(findPaidInstallment(installments, "E54811417202610161500LHBHK8vfrKX") !== null, true);
  assertEquals(findPaidInstallment(installments, "FORJADO"), null);
});

import { installmentAliases } from "./woovi-recurring-payment.ts";
Deno.test("parcela reconhecida pelo identificador e pelo E2E pago", () => {
  assertEquals(installmentAliases(installments[1]), ["01M4TJJHXSQJ2BA2NE7P2RBZAH", "E54811417202610161500LHBHK8vfrKX"]);
});
