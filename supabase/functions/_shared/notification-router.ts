import { sendPushToUser } from "./push-notifications.ts";
import { sendProactive } from "./whatsapp-provider.ts";
import type { TemplateCategory } from "./whatsapp-official.ts";

type NotificationCategory = "response" | "session" | "journey" | "practice" | "report" | "reminder" | "engagement";

type NotificationRequest = {
  userId: string;
  phone: string;
  idempotencyKey: string;
  category: NotificationCategory;
  type: string;
  title: string;
  body: string;
  path: string;
  whatsappText: string;
  whatsappCategory: TemplateCategory;
  priority?: "low" | "normal" | "high";
  expiresAt?: string;
  teaserText?: string;
  templateVariables?: string[];
};

export type RoutedNotificationResult = {
  success: boolean;
  channel: "push" | "whatsapp" | "in_app" | "none";
  reason?: string;
  error?: string;
};

function isSilentHours() {
  const hour = Number(new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(new Date()));
  return hour >= 22 || hour < 8;
}

export async function routeNotification(supabase: any, request: NotificationRequest): Promise<RoutedNotificationResult> {
  const { data: existing } = await supabase.from("notification_deliveries")
    .select("id,status,selected_channel")
    .eq("idempotency_key", request.idempotencyKey)
    .maybeSingle();
  if (existing && ["sent", "opened", "converted", "suppressed"].includes(existing.status)) {
    return { success: true, channel: existing.selected_channel || "none", reason: "duplicate" };
  }

  const { data: delivery, error: deliveryError } = await supabase.from("notification_deliveries").upsert({
    user_id: request.userId,
    idempotency_key: request.idempotencyKey,
    category: request.category,
    notification_type: request.type,
    priority: request.priority || "normal",
    path: request.path,
    expires_at: request.expiresAt || null,
    status: "pending",
    metadata: { privacy_safe: true },
  }, { onConflict: "idempotency_key" }).select("id").single();
  if (deliveryError || !delivery) throw deliveryError || new Error("Falha ao registrar entrega");

  if (request.expiresAt && new Date(request.expiresAt).getTime() <= Date.now()) {
    await supabase.from("notification_deliveries").update({ selected_channel: "none", status: "suppressed", metadata: { reason: "expired" } }).eq("id", delivery.id);
    return { success: true, channel: "none", reason: "expired" };
  }

  // Lembretes de sessão de alta prioridade preservam a entrega no horário agendado.
  if (!isSilentHours() || request.priority === "high") {
    const push = await sendPushToUser(supabase, request.userId, {
      title: request.title,
      body: request.body,
      path: request.path,
      type: request.type,
      deliveryId: delivery.id,
    });
    if (push.sent > 0) {
      await supabase.from("notification_deliveries").update({ selected_channel: "push", status: "sent" }).eq("id", delivery.id);
      await supabase.from("push_notification_events").insert({
        user_id: request.userId,
        delivery_id: delivery.id,
        event_type: "whatsapp_avoided",
        notification_type: request.type,
        path: request.path,
      });
      return { success: true, channel: "push" };
    }
    if (push.reason === "app_visible") {
      await supabase.from("notification_deliveries").update({ selected_channel: "in_app", status: "suppressed", metadata: { reason: "app_visible" } }).eq("id", delivery.id);
      return { success: true, channel: "in_app", reason: "app_visible" };
    }
  }

  const whatsapp = await sendProactive(
    request.phone,
    request.whatsappText,
    request.whatsappCategory,
    request.userId,
    undefined,
    request.teaserText,
    request.templateVariables,
  );
  await supabase.from("notification_deliveries").update({
    selected_channel: "whatsapp",
    status: whatsapp.success ? "sent" : "failed",
    metadata: whatsapp.success ? { fallback: true } : { fallback: true, error: whatsapp.error?.slice(0, 300) },
  }).eq("id", delivery.id);
  await supabase.from("push_notification_events").insert({
    user_id: request.userId,
    delivery_id: delivery.id,
    event_type: "whatsapp_fallback",
    notification_type: request.type,
    path: request.path,
    metadata: { success: whatsapp.success },
  });
  return { success: whatsapp.success, channel: "whatsapp", reason: whatsapp.error, error: whatsapp.error };
}