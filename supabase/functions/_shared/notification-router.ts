import { sendPushToUser } from "./push-notifications.ts";
import { sendProactive } from "./whatsapp-provider.ts";
import type { TemplateCategory } from "./whatsapp-official.ts";
import {
  evaluateNotificationPersonalization,
  isNonUrgentNotification,
  nextPreferredDeliveryAt,
} from "./notification-personalization.ts";

type NotificationCategory = "response" | "session" | "journey" | "practice" | "report" | "reminder" | "engagement";

type NotificationRequest = {
  userId: string;
  phone?: string;
  idempotencyKey: string;
  category: NotificationCategory;
  type: keyof typeof SAFE_PUSH_COPY;
  firstName?: string;
  path: string;
  whatsappText: string;
  whatsappCategory: TemplateCategory;
  priority?: "low" | "normal" | "high";
  expiresAt?: string;
  teaserText?: string;
  templateVariables?: string[];
  fallback?: "whatsapp" | "none";
  scheduledDeliveryId?: string;
};

const SAFE_PUSH_COPY = {
  session_reminder_24h: (name?: string) => ({ title: `${name || "Oi"}, sua sessão está chegando`, body: "Abra a AURA para conferir e se preparar." }),
  session_reminder_5m: (name?: string) => ({ title: `${name || "Oi"}, sua sessão começa em instantes`, body: "A AURA já está pronta para receber você." }),
  monthly_schedule_available: (name?: string) => ({ title: `${name || "Oi"}, suas sessões do mês estão disponíveis`, body: "Escolha seus melhores dias e horários no aplicativo." }),
  journey_available: () => ({ title: "Uma nova parte da sua jornada chegou", body: "Abra a AURA quando tiver um momento para você." }),
  report_available: (name?: string) => ({ title: `${name || "Oi"}, seu resumo está pronto`, body: "Veja os movimentos e avanços que marcaram este período." }),
  new_reply: () => ({ title: "AURA", body: "Tem uma nova mensagem esperando por você." }),
} as const;

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

async function scheduleDelivery(
  supabase: any,
  request: NotificationRequest,
  deliveryId: string,
  scheduledFor: Date,
  reason: string,
) {
  const expiresBeforeDelivery = request.expiresAt
    && new Date(request.expiresAt).getTime() <= scheduledFor.getTime();
  if (expiresBeforeDelivery) return false;

  const { error } = await supabase.from("scheduled_tasks").insert({
    user_id: request.userId,
    task_type: "notification_delivery",
    execute_at: scheduledFor.toISOString(),
    status: "pending",
    payload: { ...request, scheduledDeliveryId: deliveryId },
  });
  if (error) {
    console.error("Falha ao programar notificação:", error);
    return false;
  }

  await supabase.from("notification_deliveries").update({
    status: "scheduled",
    selected_channel: null,
    scheduled_for: scheduledFor.toISOString(),
    metadata: { privacy_safe: true, reason },
  }).eq("id", deliveryId);
  return true;
}

export async function routeNotification(supabase: any, request: NotificationRequest): Promise<RoutedNotificationResult> {
  const priority = request.priority || "normal";
  const scopedIdempotencyKey = `${request.userId}:${request.idempotencyKey}`;
  const personalization = await evaluateNotificationPersonalization(supabase, {
    userId: request.userId,
    category: request.category,
    priority,
    currentDeliveryId: request.scheduledDeliveryId,
  });
  const newDelivery = {
    user_id: request.userId,
    idempotency_key: scopedIdempotencyKey,
    category: request.category,
    notification_type: request.type,
    priority,
    path: request.path,
    expires_at: request.expiresAt || null,
    status: "pending",
    metadata: {
      privacy_safe: true,
      personalization_rule: personalization.rule,
      journey_stage: personalization.stage,
      preferred_hour_brt: personalization.preferredHourBrt,
      timing_source: personalization.timingSource,
    },
  };
  let delivery: { id: string } | null = null;
  let deliveryError: any = null;
  if (request.scheduledDeliveryId) {
    const existingResult = await supabase.from("notification_deliveries")
      .update({ status: "pending" })
      .eq("id", request.scheduledDeliveryId)
      .eq("user_id", request.userId)
      .eq("status", "scheduled")
      .select("id")
      .maybeSingle();
    delivery = existingResult.data;
    deliveryError = existingResult.error;
    if (!delivery) return { success: true, channel: "none", reason: "scheduled_delivery_unavailable" };
  } else {
    const insertResult = await supabase.from("notification_deliveries")
      .insert(newDelivery).select("id").single();
    delivery = insertResult.data;
    deliveryError = insertResult.error;
  }
  if (!request.scheduledDeliveryId && deliveryError?.code === "23505") {
    const { data: existing } = await supabase.from("notification_deliveries")
      .select("id,status,selected_channel,updated_at")
      .eq("idempotency_key", scopedIdempotencyKey)
      .eq("user_id", request.userId)
      .single();
    if (!existing) throw new Error("Chave de entrega já pertence a outro cliente");
    const stalePending = existing?.status === "pending"
      && Date.now() - new Date(existing.updated_at).getTime() > 5 * 60_000;
    if (existing?.status !== "failed" && !stalePending) {
      return { success: true, channel: existing?.selected_channel || "none", reason: "duplicate" };
    }
    const { data: reclaimed } = await supabase.from("notification_deliveries")
      .update({
        status: "pending",
        category: request.category,
        notification_type: request.type,
        priority,
        path: request.path,
        expires_at: request.expiresAt || null,
        metadata: { privacy_safe: true, retry: true },
      })
      .eq("id", existing.id)
      .eq("status", existing.status)
      .eq("updated_at", existing.updated_at)
      .select("id")
      .maybeSingle();
    if (!reclaimed) return { success: true, channel: "none", reason: "duplicate" };
    delivery = reclaimed;
    deliveryError = null;
  }
  if (deliveryError || !delivery) throw deliveryError || new Error("Falha ao registrar entrega");

  if (!personalization.allowed) {
    if (personalization.reason === "daily_non_urgent_cap") {
      const nextDay = nextPreferredDeliveryAt(
        personalization.preferredHourBrt,
        request.userId,
        new Date(),
        true,
      );
      if (await scheduleDelivery(supabase, request, delivery.id, nextDay, "deferred_daily_cap")) {
        return { success: true, channel: "none", reason: "deferred_daily_cap" };
      }
    }
    await supabase.from("notification_deliveries").update({
      selected_channel: "none",
      status: "suppressed",
      metadata: {
        privacy_safe: true,
        reason: personalization.reason,
        personalization_rule: personalization.rule,
        journey_stage: personalization.stage,
        preferred_hour_brt: personalization.preferredHourBrt,
        timing_source: personalization.timingSource,
      },
    }).eq("id", delivery.id);
    return { success: true, channel: "none", reason: personalization.reason };
  }

  if (request.expiresAt && new Date(request.expiresAt).getTime() <= Date.now()) {
    await supabase.from("notification_deliveries").update({ selected_channel: "none", status: "suppressed", metadata: { reason: "expired" } }).eq("id", delivery.id);
    return { success: true, channel: "none", reason: "expired" };
  }

  const timingContext = { userId: request.userId, category: request.category, priority };
  if (!request.scheduledDeliveryId && isNonUrgentNotification(timingContext)) {
    const scheduledFor = nextPreferredDeliveryAt(personalization.preferredHourBrt, request.userId);
    const waitMs = scheduledFor.getTime() - Date.now();
    if (waitMs > 5 * 60_000) {
      if (await scheduleDelivery(supabase, request, delivery.id, scheduledFor, "preferred_hour")) {
        return { success: true, channel: "none", reason: "scheduled_for_preferred_hour" };
      }
    }
  }

  const silentHours = isSilentHours();
  const mayNotifyNow = !silentHours || request.priority === "high";
  // Lembretes de sessão de alta prioridade preservam a entrega no horário agendado.
  if (mayNotifyNow) {
    const safeCopy = SAFE_PUSH_COPY[request.type](request.firstName);
    const push = await sendPushToUser(supabase, request.userId, {
      title: safeCopy.title,
      body: safeCopy.body,
      path: request.path,
      type: request.type,
      deliveryId: delivery.id,
    });
    if (push.sent > 0) {
      await supabase.from("notification_deliveries").update({
        selected_channel: "push",
        status: "sent",
        metadata: { privacy_safe: true, devices_sent: push.sent },
      }).eq("id", delivery.id);
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
      await supabase.from("push_notification_events").insert({
        user_id: request.userId,
        delivery_id: delivery.id,
        event_type: "app_visible",
        notification_type: request.type,
        path: request.path,
      });
      return { success: true, channel: "in_app", reason: "app_visible" };
    }
  }

  // Prioridade alta pode gerar push no horário do compromisso, mas nunca
  // abre exceção para contato proativo pelo WhatsApp durante o silêncio.
  if (silentHours && request.category === "response") {
    const afterSilence = nextPreferredDeliveryAt(8, request.userId);
    if (await scheduleDelivery(supabase, request, delivery.id, afterSilence, "after_silent_hours")) {
      return { success: true, channel: "none", reason: "scheduled_after_silent_hours" };
    }
  }
  if (silentHours || request.fallback === "none") {
    const reason = silentHours ? "silent_hours" : "push_unavailable";
    await supabase.from("notification_deliveries").update({ selected_channel: "none", status: "suppressed", metadata: { reason } }).eq("id", delivery.id);
    return { success: true, channel: "none", reason };
  }

  if (!request.phone?.trim()) {
    await supabase.from("notification_deliveries").update({
      selected_channel: "none",
      status: "suppressed",
      metadata: { reason: "whatsapp_unavailable" },
    }).eq("id", delivery.id);
    return { success: true, channel: "none", reason: "whatsapp_unavailable" };
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
    metadata: { success: whatsapp.success, outcome: whatsapp.success ? "sent" : "failed" },
  });
  return { success: whatsapp.success, channel: "whatsapp", reason: whatsapp.error, error: whatsapp.error };
}