// Leitura somente-consulta das estatísticas do Pixel do Meta + conciliação com
// os nossos próprios contadores (checkout_funnel_events e meta_capi_log).
// Objetivo: conferir "quantos eventos o Meta recebeu" sem depender de print
// do Gerenciador de Eventos. NUNCA devolve o access token.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const PIXEL_ID = Deno.env.get("META_PIXEL_ID") || "939366085297921";
const GRAPH = "https://graph.facebook.com/v21.0";

/** Início do dia em BRT (UTC-3) deslocado em `offsetDays`, em ISO UTC. */
function brtDayStart(offsetDays: number): Date {
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return new Date(
    Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate() + offsetDays, 3, 0, 0),
  );
}

const brtDayKey = (iso: string): string =>
  new Date(new Date(iso).getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

async function resolveToken(sb: ReturnType<typeof createClient>): Promise<string | undefined> {
  try {
    const { data } = await sb.from("instagram_config").select("meta_access_token").eq("id", 1).single();
    if (data?.meta_access_token) return data.meta_access_token as string;
  } catch (_) { /* cai no env */ }
  return Deno.env.get("META_ACCESS_TOKEN") ?? undefined;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body, null, 2), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Só admin autenticado lê este diagnóstico.
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "unauthorized" }, 401);
    const { data: claims } = await admin.auth.getClaims(jwt);
    const uid = (claims as any)?.claims?.sub as string | undefined;
    if (!uid) return json({ error: "unauthorized" }, 401);
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: uid, _role: "admin" });
    if (!isAdmin) return json({ error: "forbidden" }, 403);

    const url = new URL(req.url);
    const bodyDays = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const days = Math.min(30, Math.max(1, Number(bodyDays?.days ?? url.searchParams.get("days") ?? 7)));

    const since = brtDayStart(-(days - 1));
    const until = brtDayStart(1);

    const token = await resolveToken(admin);
    if (!token) return json({ error: "missing_meta_token" }, 500);

    // --- Meta: estatísticas do pixel (eventos recebidos, por dia e por evento)
    const statsUrl =
      `${GRAPH}/${PIXEL_ID}/stats?aggregation=event&start_time=${Math.floor(since.getTime() / 1000)}` +
      `&end_time=${Math.floor(until.getTime() / 1000)}&access_token=${encodeURIComponent(token)}`;
    const infoUrl =
      `${GRAPH}/${PIXEL_ID}?fields=name,last_fired_time,creation_time&access_token=${encodeURIComponent(token)}`;

    const [statsRes, infoRes] = await Promise.all([fetch(statsUrl), fetch(infoUrl)]);
    const statsJson = await statsRes.json().catch(() => null);
    const infoJson = await infoRes.json().catch(() => null);

    // --- Nossos números: início de checkout real (por pessoa) e envios do CAPI
    const [{ data: funnel }, { data: capi }] = await Promise.all([
      admin
        .from("checkout_funnel_events")
        .select("anon_session_id, step, payment_method, created_at")
        .gte("created_at", since.toISOString())
        .in("step", ["form_submit", "pix_modal_open"])
        .limit(20000),
      admin
        .from("meta_capi_log")
        .select("event_name, event_id, meta_status, created_at")
        .gte("created_at", since.toISOString())
        .limit(20000),
    ]);

    const byDay: Record<string, {
      inicio_checkout_pessoas: number;
      capi_initiate_checkout: number;
      capi_lead: number;
      capi_purchase: number;
      capi_erros: number;
    }> = {};
    const seen: Record<string, Set<string>> = {};

    for (const e of funnel ?? []) {
      const d = brtDayKey(e.created_at as string);
      byDay[d] ??= { inicio_checkout_pessoas: 0, capi_initiate_checkout: 0, capi_lead: 0, capi_purchase: 0, capi_erros: 0 };
      seen[d] ??= new Set();
      const key = `${e.anon_session_id}`;
      if (e.anon_session_id && !seen[d].has(key)) {
        seen[d].add(key);
        byDay[d].inicio_checkout_pessoas += 1;
      }
    }

    for (const l of capi ?? []) {
      const d = brtDayKey(l.created_at as string);
      byDay[d] ??= { inicio_checkout_pessoas: 0, capi_initiate_checkout: 0, capi_lead: 0, capi_purchase: 0, capi_erros: 0 };
      if (l.event_name === "InitiateCheckout") byDay[d].capi_initiate_checkout += 1;
      if (l.event_name === "Lead") byDay[d].capi_lead += 1;
      if (l.event_name === "Purchase") byDay[d].capi_purchase += 1;
      if (typeof l.meta_status === "number" && l.meta_status >= 300) byDay[d].capi_erros += 1;
    }

    return json({
      pixel_id: PIXEL_ID,
      janela_brt: { de: since.toISOString(), ate: until.toISOString(), dias: days },
      pixel_info: infoJson?.error ? { error: infoJson.error?.message } : infoJson,
      meta_stats: statsJson?.error ? { error: statsJson.error?.message, code: statsJson.error?.code } : statsJson,
      nossos_numeros_por_dia: byDay,
      leitura: {
        nota:
          "O Gerenciador mostra EVENTOS RECEBIDOS (navegador + servidor) antes da deduplicação. " +
          "Cada início de checkout real gera 2 recebidos (pixel + CAPI) com o mesmo event_id.",
      },
    });
  } catch (e) {
    console.error("meta-insights error", e);
    return json({ error: "internal_error" }, 500);
  }
});
