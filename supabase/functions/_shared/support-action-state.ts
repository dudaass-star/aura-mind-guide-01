export interface SupportActionRecord {
  id: string;
  action_type: string;
  success: boolean;
  payload?: Record<string, unknown> | null;
  stripe_response?: Record<string, unknown> | null;
  error_message?: string | null;
}

// REJEITADA não prova cancelamento: exige recibo de sucesso do mesmo mandato.
export function confirmedWooviCancellation(
  subscription: { subscription_id: string; status: string },
  actions: SupportActionRecord[],
): SupportActionRecord | undefined {
  if (!["CANCELADA", "REJEITADA"].includes(subscription.status)) return undefined;
  return actions.find((action) =>
    action.success &&
    action.action_type === "cancel_subscription" &&
    action.stripe_response?.gateway === "woovi" &&
    action.stripe_response?.status === "CANCELADA" &&
    action.stripe_response?.subscription_id === subscription.subscription_id
  );
}

const criticalTypes = new Set([
  "refund_invoice", "pause_subscription", "change_plan", "cancel_subscription",
  "refund_asaas_payment", "cancel_asaas_subscription",
]);

function actionKey(action: SupportActionRecord): string {
  const p = action.payload || {};
  const type = action.action_type === "cancel_asaas_subscription"
    ? "cancel_subscription" : action.action_type;
  const target = p.woovi_subscription_id || p.subscription_id || p.asaas_subscription_id ||
    p.invoice_id || p.asaas_payment_id || "";
  return `${type}:${target}`;
}

// A lista vem do mais recente para o mais antigo. Sucesso novo supera somente
// a falha da mesma operação; falhas de outras cobranças continuam bloqueando.
export function unresolvedCriticalFailure(actions: SupportActionRecord[]): SupportActionRecord | undefined {
  const resolved = new Set<string>();
  for (const action of actions) {
    if (!criticalTypes.has(action.action_type)) continue;
    const key = actionKey(action);
    if (resolved.has(key)) continue;
    if (action.success) {
      resolved.add(key);
      // Falhas de resolução antigas não tinham ID; a nova confirmação as resolve.
      resolved.add(`${key.split(":")[0]}:`);
    } else {
      return action;
    }
  }
  return undefined;
}