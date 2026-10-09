import { normalizePendingActionWording, SERVICE_POLICY } from "./service-policy.ts";

Deno.test("encaminhamento pendente não é apresentado como realizado", () => {
  const result = normalizePendingActionWording("Já encaminhei o cancelamento. Já encaminhamos a solicitação de estorno.");
  if (result !== "vou encaminhar o cancelamento. vamos encaminhar a solicitação de estorno.") {
    throw new Error("Encaminhamento não normalizado");
  }
});

Deno.test("preserva texto sem afirmação de encaminhamento concluído", () => {
  const text = "Vou solicitar o reembolso. Se preferir cancelar, tudo bem.";
  if (normalizePendingActionWording(text) !== text) throw new Error("Texto alterado indevidamente");
});

Deno.test("política cobre decisão definitiva, garantia e investigação sem travar cancelamento", () => {
  for (const rule of ["no máximo UMA", "Silêncio não é aceite", "data original do pedido", "Uso do App sozinho não elimina direitos", "investigar reembolso não deve travar o cancelamento", "Todo reembolso exige aprovação humana"]) {
    if (!SERVICE_POLICY.includes(rule)) throw new Error(`Regra ausente: ${rule}`);
  }
});