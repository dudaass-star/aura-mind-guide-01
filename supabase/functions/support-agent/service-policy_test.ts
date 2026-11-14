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
import { customerRequestedRefund as crr } from "./service-policy.ts";
Deno.test("cancelar compra não é pedido de reembolso", () => {
  if (crr(["Quero cancelar minha compra, o app não era o que imaginei e sei que tenho a opção de cancelamento"])) throw new Error("falso positivo");
  if (!crr(["Quero meu dinheiro de volta"]) || !crr(["solicito o estorno"])) throw new Error("falso negativo");
});
