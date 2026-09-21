import { initializeApp, getApps } from "firebase/app";
import { getMessaging, getToken, isSupported } from "firebase/messaging";
import { supabasePortal } from "@/integrations/supabase/portal-client";

const appId = import.meta.env.VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_APP_ID;
const vapidKey = import.meta.env.VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_VAPID_KEY;
const firebaseConfig = {
  apiKey: import.meta.env.VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_WEB_API_KEY,
  projectId: import.meta.env.VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_PROJECT_ID,
  appId,
  messagingSenderId: appId?.split(":")[1] ?? "",
};

export type PushActivationResult =
  | { status: "registered" }
  | { status: "not-configured" | "unsupported" | "open-in-new-tab" | "denied" | "install-first" | "error" };

export function getPushPermission() {
  if (!("Notification" in window)) return "unsupported" as const;
  return Notification.permission;
}

export function isIosPushInstallRequired() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches
    || ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
  return ios && !standalone;
}

export async function enablePushNotifications(): Promise<PushActivationResult> {
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !appId || !vapidKey || !firebaseConfig.messagingSenderId) {
    return { status: "not-configured" };
  }
  if (isIosPushInstallRequired()) return { status: "install-first" };
  if (!("Notification" in window) || !(await isSupported())) return { status: "unsupported" };
  if (window.top !== window.self) return { status: "open-in-new-tab" };

  const permission = Notification.permission === "granted"
    ? "granted"
    : await Notification.requestPermission();
  if (permission !== "granted") {
    await supabasePortal.functions.invoke("register-push-device", { body: { action: "permission_denied" } });
    return { status: "denied" };
  }

  try {
    const query = new URLSearchParams(firebaseConfig).toString();
    const serviceWorkerRegistration = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${query}`);
    const app = getApps()[0] ?? initializeApp(firebaseConfig);
    const token = await getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration });
    if (!token) return { status: "error" };

    const platform = /iphone|ipad|ipod/i.test(navigator.userAgent)
      ? "ios"
      : /android/i.test(navigator.userAgent)
        ? "android"
        : "desktop";
    const { data, error } = await supabasePortal.functions.invoke("register-push-device", {
      body: { action: "register", token, platform, userAgent: navigator.userAgent },
    });
    if (error || !data?.registered || !data?.deviceId) throw error || new Error("Falha ao registrar aparelho");
    localStorage.setItem("aura-push-enabled", "true");
    localStorage.setItem("aura-push-device-id", data.deviceId);
    return { status: "registered" };
  } catch (error) {
    console.warn("Falha ao ativar notificações", error);
    return { status: "error" };
  }
}

export async function disablePushNotifications() {
  const deviceId = localStorage.getItem("aura-push-device-id");
  if (deviceId) {
    await supabasePortal.functions.invoke("register-push-device", { body: { action: "disable_current", deviceId } });
  }
  localStorage.removeItem("aura-push-enabled");
  localStorage.removeItem("aura-push-device-id");
}

export function reportPushPresence(foreground: boolean) {
  const deviceId = localStorage.getItem("aura-push-device-id");
  if (localStorage.getItem("aura-push-enabled") !== "true" || !deviceId) return;
  void supabasePortal.functions.invoke("register-push-device", { body: { action: "presence", deviceId, foreground } });
}

const PUSH_ATTRIBUTION_KEY = "aura-push-attribution";
const PUSH_ATTRIBUTION_WINDOW_MS = 24 * 60 * 60 * 1000;

export function rememberPushAttribution(deliveryId: string, notificationType?: string) {
  sessionStorage.setItem(PUSH_ATTRIBUTION_KEY, JSON.stringify({
    deliveryId,
    notificationType,
    openedAt: Date.now(),
  }));
}

export async function reportPushConversion(path: string) {
  const raw = sessionStorage.getItem(PUSH_ATTRIBUTION_KEY);
  if (!raw) return;
  try {
    const attribution = JSON.parse(raw) as { deliveryId?: string; notificationType?: string; openedAt?: number };
    if (!attribution.deliveryId || !attribution.openedAt || Date.now() - attribution.openedAt > PUSH_ATTRIBUTION_WINDOW_MS) {
      sessionStorage.removeItem(PUSH_ATTRIBUTION_KEY);
      return;
    }
    const { error } = await supabasePortal.functions.invoke("register-push-device", {
      body: {
        action: "event",
        eventType: "converted",
        notificationType: attribution.notificationType,
        deliveryId: attribution.deliveryId,
        path,
      },
    });
    if (!error) sessionStorage.removeItem(PUSH_ATTRIBUTION_KEY);
  } catch {
    sessionStorage.removeItem(PUSH_ATTRIBUTION_KEY);
  }
}
