import { APP_SUPPORT_POLICY, normalizeAppSupportAction } from "./app-policy.ts";

Deno.test("troca legada vira orientação ao App sem parâmetros financeiros", () => {
  const result = normalizeAppSupportAction({ type: "change_plan", params: { subscription_id: "sub_test", new_plan: "transformacao", billing: "monthly" }, reason: "upgrade" });
  if (result.type !== "send_portal_link" || Object.keys(result.params).length) throw new Error("Troca financeira não bloqueada");
});

Deno.test("preserva cancelamento aprovado e ações não relacionadas à troca", () => {
  for (const type of ["none", "cancel_subscription", "refund_invoice", "cancel_asaas_subscription"]) {
    const action = { type, params: { id: "test" } };
    if (normalizeAppSupportAction(action) !== action) throw new Error("Ação alterada indevidamente");
  }
});

Deno.test("orientações cobrem acesso, menu e diferenças de pagamento", () => {
  for (const rule of ["código de 8 dígitos", "menu de três pontos", "Trocar de plano", "nova autorização no banco", "cartão Asaas", "Orações", "Meditações", "não é consentimento", "não agenda"]) {
    if (!APP_SUPPORT_POLICY.includes(rule)) throw new Error(`Regra ausente: ${rule}`);
  }
});