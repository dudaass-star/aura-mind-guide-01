import { expect, test } from "bun:test";
import { confirmedWooviCancellation, unresolvedCriticalFailure, type SupportActionRecord } from "../supabase/functions/_shared/support-action-state";

const receipt: SupportActionRecord = {
  id: "recibo", action_type: "cancel_subscription", success: true,
  payload: { woovi_subscription_id: "mandato-1" },
  stripe_response: { gateway: "woovi", status: "CANCELADA", subscription_id: "mandato-1" },
};

test("cancelamento concluído reconhece o mesmo mandato sem nova cobrança ou cancelamento", () => {
  expect(confirmedWooviCancellation({ subscription_id: "mandato-1", status: "CANCELADA" }, [receipt])?.id).toBe("recibo");
});
test("rejeição posterior do webhook não apaga o recibo de cancelamento", () => {
  expect(confirmedWooviCancellation({ subscription_id: "mandato-1", status: "REJEITADA" }, [receipt])?.id).toBe("recibo");
});
test("mandato rejeitado sem recibo nunca vira cancelamento bem-sucedido", () => {
  expect(confirmedWooviCancellation({ subscription_id: "mandato-1", status: "REJEITADA" }, [])).toBeUndefined();
});
test("sucesso de outro mandato ou tentativa falha não autoriza repetição", () => {
  expect(confirmedWooviCancellation({ subscription_id: "mandato-2", status: "CANCELADA" }, [receipt])).toBeUndefined();
  expect(confirmedWooviCancellation({ subscription_id: "mandato-1", status: "CANCELADA" }, [{ ...receipt, success: false }])).toBeUndefined();
});
test("mandato ativo não reutiliza sucesso antigo", () => {
  expect(confirmedWooviCancellation({ subscription_id: "mandato-1", status: "ATIVA" }, [receipt])).toBeUndefined();
});
test("repetição confirmada libera envio apesar da falha antiga sem ID", () => {
  expect(unresolvedCriticalFailure([receipt, { id: "falha", action_type: "cancel_subscription", success: false, payload: {} }])).toBeUndefined();
});
test("recuperação não libera falha de outra operação", () => {
  expect(unresolvedCriticalFailure([receipt, { id: "reembolso", action_type: "refund_invoice", success: false, payload: { invoice_id: "fatura-1" } }])?.id).toBe("reembolso");
});
test("recuperação não libera falha de outro contrato", () => {
  expect(unresolvedCriticalFailure([receipt, { id: "outro", action_type: "cancel_subscription", success: false, payload: { woovi_subscription_id: "mandato-2" } }])?.id).toBe("outro");
});
test("falha mais nova continua bloqueando, mesmo com sucesso anterior", () => {
  expect(unresolvedCriticalFailure([{ id: "nova-falha", action_type: "cancel_subscription", success: false }, receipt])?.id).toBe("nova-falha");
});