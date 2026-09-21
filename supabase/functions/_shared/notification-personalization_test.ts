import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluateNotificationPersonalization, isNonUrgentNotification, nextPreferredDeliveryAt } from "./notification-personalization.ts";

Deno.test("resposta e lembrete prioritário nunca são adiados pela personalização", () => {
  assertEquals(isNonUrgentNotification({ userId: "u", category: "response", priority: "normal" }), false);
  assertEquals(isNonUrgentNotification({ userId: "u", category: "reminder", priority: "normal" }), false);
  assertEquals(isNonUrgentNotification({ userId: "u", category: "session", priority: "high" }), false);
});

Deno.test("conteúdo não urgente pode aguardar o melhor horário", () => {
  assertEquals(isNonUrgentNotification({ userId: "u", category: "journey", priority: "normal" }), true);
  assertEquals(isNonUrgentNotification({ userId: "u", category: "report", priority: "low" }), true);
  assertEquals(isNonUrgentNotification({ userId: "u", category: "session", priority: "normal" }), true);
});

Deno.test("agenda para hoje quando o horário preferido ainda não chegou", () => {
  const now = new Date("2026-09-21T15:00:00.000Z"); // 12h BRT
  const scheduled = nextPreferredDeliveryAt(19, "cliente-a", now);
  assertEquals(scheduled.toISOString().slice(0, 13), "2026-09-21T22");
});

Deno.test("agenda para o dia seguinte quando o horário preferido já passou", () => {
  const now = new Date("2026-09-21T23:00:00.000Z"); // 20h BRT
  const scheduled = nextPreferredDeliveryAt(19, "cliente-a", now);
  assertEquals(scheduled.toISOString().slice(0, 13), "2026-09-22T22");
});

Deno.test("envia agora quando já está dentro da hora preferida", () => {
  const now = new Date("2026-09-21T22:35:00.000Z"); // 19h35 BRT
  assertEquals(nextPreferredDeliveryAt(19, "cliente-a", now).toISOString(), now.toISOString());
});

Deno.test("sessão mensal normal participa do limite diário", () => {
  assertEquals(isNonUrgentNotification({ userId: "u", category: "session", priority: "normal" }), true);
});

Deno.test("resposta normal continua fora do limite diário de descoberta", () => {
  assertEquals(isNonUrgentNotification({ userId: "u", category: "response", priority: "normal" }), false);
});

function createPersonalizationDb(deliveries: Array<{ id: string }> = []) {
  const profiles = {
    select: () => profiles,
    eq: () => profiles,
    maybeSingle: async () => ({ data: { created_at: "2026-09-18T15:00:00.000Z" } }),
  };
  const messages = {
    select: () => messages,
    eq: () => messages,
    not: () => messages,
    order: () => messages,
    limit: async () => ({ data: [] }),
  };
  const notificationDeliveries = {
    select: () => notificationDeliveries,
    eq: () => notificationDeliveries,
    in: () => notificationDeliveries,
    not: () => notificationDeliveries,
    gte: () => notificationDeliveries,
    neq: (_field: string, id: string) => ({ count: deliveries.filter((item) => item.id !== id).length }),
    then: (resolve: (value: { count: number }) => unknown) => resolve({ count: deliveries.length }),
  };
  return {
    from: (table: string) => table === "profiles" ? profiles : table === "messages" ? messages : notificationDeliveries,
  };
}

Deno.test("uma entrega programada não bloqueia a própria execução", async () => {
  const result = await evaluateNotificationPersonalization(createPersonalizationDb([{ id: "atual" }]), {
    userId: "cliente-a",
    category: "journey",
    priority: "normal",
    currentDeliveryId: "atual",
  });
  assertEquals(result.allowed, true);
});

Deno.test("outra comunicação não urgente no mesmo dia bloqueia uma segunda", async () => {
  const result = await evaluateNotificationPersonalization(createPersonalizationDb([{ id: "anterior" }]), {
    userId: "cliente-a",
    category: "report",
    priority: "normal",
    currentDeliveryId: "atual",
  });
  assertEquals(result.allowed, false);
  assertEquals(result.reason, "daily_non_urgent_cap");
});