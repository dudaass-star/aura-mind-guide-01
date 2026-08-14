// QA temporário: valida se a leitura de stats do pixel funciona com o token atual.
// Não expõe o token. Será removido após o diagnóstico.
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async () => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let token = Deno.env.get("META_ACCESS_TOKEN");
  try {
    const { data } = await admin.from("instagram_config").select("meta_access_token").eq("id", 1).single();
    if (data?.meta_access_token) token = data.meta_access_token as string;
  } catch (_) { /* env */ }
  const pixel = Deno.env.get("META_PIXEL_ID") || "939366085297921";
  const g = "https://graph.facebook.com/v21.0";
  const now = Math.floor(Date.now() / 1000);
  const out: Record<string, unknown> = {};
  for (const [k, u] of Object.entries({
    info: `${g}/${pixel}?fields=name,last_fired_time,creation_time`,
    stats_source: `${g}/${pixel}/stats?aggregation=event_source&start_time=${Math.floor(Date.parse('2026-08-14T12:00:00Z')/1000)}&end_time=${Math.floor(Date.parse('2026-08-14T13:00:00Z')/1000)}`,
    stats_host: `${g}/${pixel}/stats?aggregation=host&start_time=${Math.floor(Date.parse('2026-08-14T12:00:00Z')/1000)}&end_time=${Math.floor(Date.parse('2026-08-14T13:00:00Z')/1000)}`,
    stats_event: `${g}/${pixel}/stats?aggregation=event&start_time=${Math.floor(Date.parse('2026-08-14T03:00:00Z')/1000)}&end_time=${now}`,
  })) {
    const r = await fetch(`${u}&access_token=${encodeURIComponent(token ?? "")}`);
    out[k] = { status: r.status, body: await r.json().catch(() => null) };
  }
  return new Response(JSON.stringify(out, null, 2), { headers: { "Content-Type": "application/json" } });
});
