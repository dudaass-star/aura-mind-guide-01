const GATEWAY_URL = "https://connector-gateway.lovable.dev/firebase_messaging";

type PushOptions = {
  title: string;
  body: string;
  path: string;
  type: string;
  deliveryId?: string;
};

export async function sendPushToUser(supabase: any, userId: string, options: PushOptions) {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const firebaseKey = Deno.env.get("FIREBASE_MESSAGING_API_KEY");
  if (!lovableKey || !firebaseKey) return { sent: 0, reason: "not_configured" };

  const { data: entitled } = await supabase.rpc("has_portal_entitlement", { _user_id: userId });
  if (!entitled) return { sent: 0, reason: "not_entitled" };
  const { data: devices, error } = await supabase.from("push_devices")
    .select("id,token,is_foreground,last_seen_at")
    .eq("user_id", userId)
    .eq("enabled", true);
  if (error || !devices?.length) return { sent: 0, reason: "no_devices" };

  let sent = 0;
  const separator = options.path.includes("?") ? "&" : "?";
  const trackedPath = `${options.path}${separator}push=open&type=${encodeURIComponent(options.type)}`;
  const backgroundDevices = devices.filter((device: { is_foreground: boolean; last_seen_at: string }) =>
    !device.is_foreground || Date.now() - new Date(device.last_seen_at).getTime() > 90_000
  );
  if (!backgroundDevices.length) return { sent: 0, reason: "app_visible" };
  await Promise.all(backgroundDevices.map(async (device: { id: string; token: string }) => {
    const response = await fetch(`${GATEWAY_URL}/v1/projects/_/messages:send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": firebaseKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token: device.token,
          notification: { title: options.title, body: options.body },
          data: { path: trackedPath, type: options.type },
          webpush: {
            notification: { icon: "/aura-icon-192.png", badge: "/aura-icon-192.png", data: { path: trackedPath } },
            fcm_options: { link: `https://olaaura.com.br${trackedPath}` },
          },
        },
      }),
    });
    if (response.ok) {
      sent += 1;
      await supabase.from("push_notification_events").insert({
        user_id: userId, device_id: device.id, delivery_id: options.deliveryId || null, event_type: "sent", notification_type: options.type, path: trackedPath,
      });
      return;
    }
    const failure = await response.text();
    const stale = (response.status === 404 && failure.includes("UNREGISTERED"))
      || (response.status === 400 && failure.includes("INVALID_ARGUMENT"));
    if (stale) await supabase.from("push_devices").update({ enabled: false }).eq("id", device.id);
    await supabase.from("push_notification_events").insert({
      user_id: userId,
      device_id: device.id,
      delivery_id: options.deliveryId || null,
      event_type: "failed",
      notification_type: options.type,
      path: trackedPath,
      metadata: { status: response.status, stale },
    });
    console.error(`Falha no push [${response.status}]: ${failure.slice(0, 500)}`);
  }));
  return { sent };
}
