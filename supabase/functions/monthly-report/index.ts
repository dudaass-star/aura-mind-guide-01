import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { routeNotification } from "../_shared/notification-router.ts";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const BATCH_SIZE = 20;
type Metrics = { messages: number; sessions: number; journeys: number; practices: number };

function monthPeriods(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).formatToParts(now).map((x) => [x.type, x.value]));
  const end = new Date(`${p.year}-${p.month}-01T03:00:00Z`);
  const start = new Date(end); start.setUTCMonth(end.getUTCMonth() - 1);
  const previous = new Date(start); previous.setUTCMonth(start.getUTCMonth() - 1);
  return { previous, start, end };
}
const day = (date: Date) => date.toISOString().slice(0, 10);
async function count(query: any, column: string, start: Date, end: Date) { const result = await query.gte(column, start.toISOString()).lt(column, end.toISOString()); if (result.error) throw result.error; return result.count || 0; }
async function getMetrics(db: any, userId: string, start: Date, end: Date): Promise<Metrics> {
  const [messages, sessions, journeys, practices] = await Promise.all([
    count(db.from("messages").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("role", "user"), "created_at", start, end),
    count(db.from("sessions").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "completed"), "ended_at", start, end),
    count(db.from("user_journey_history").select("id", { count: "exact", head: true }).eq("user_id", userId), "completed_at", start, end),
    count(db.from("user_meditation_history").select("id", { count: "exact", head: true }).eq("user_id", userId), "sent_at", start, end),
  ]); return { messages, sessions, journeys, practices };
}
function compare(current: number, previous: number) { return current === previous ? "o mesmo ritmo do mês anterior" : current > previous ? `${current - previous} a mais que no mês anterior` : `${previous - current} a menos que no mês anterior`; }
function reportText(name: string, current: Metrics, previous: Metrics) {
  const rows = [["conversas", current.messages, previous.messages], ["sessões", current.sessions, previous.sessions], ["episódios de Jornadas", current.journeys, previous.journeys], ["práticas", current.practices, previous.practices]] as const;
  const visible = rows.filter(([, a, b]) => a || b);
  if (!visible.length) return `Seu mês em perspectiva, ${name}\n\nEste foi um mês mais silencioso na Olá Aura. Seu Percurso continua guardado, sem conclusões prontas, para você retomar quando fizer sentido.`;
  return `Seu mês em perspectiva, ${name}\n\n${visible.map(([label, a, b]) => `• ${a} ${label} — ${compare(a, b)}`).join("\n")}\n\nEsses sinais mostram como você usou a Olá Aura; não definem como você se sentiu. Você pode confirmar ou corrigir qualquer leitura da AURA.`;
}
async function next(offset: number, period: string) { await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/monthly-report`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` }, body: JSON.stringify({ offset, period_start: period }) }); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
    if (!body.target_user_id && (hour < 8 || hour >= 22)) return Response.json({ status: "skipped", reason: "quiet_hours" }, { headers: corsHeaders });
    const offset = Number(body.offset || 0), dryRun = body.dry_run === true, target = typeof body.target_user_id === "string" ? body.target_user_id : null;
    const periods = monthPeriods(body.period_start ? new Date(`${body.period_start}T12:00:00Z`) : new Date());
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    let query = db.from("profiles").select("user_id,name,phone").eq("status", "active").order("created_at", { ascending: true });
    query = target ? query.eq("user_id", target) : query.range(offset, offset + BATCH_SIZE - 1);
    const { data: profiles, error } = await query; if (error) throw error;
    const results: unknown[] = [];
    for (const profile of profiles || []) try {
      const [current, previous] = await Promise.all([getMetrics(db, profile.user_id, periods.start, periods.end), getMetrics(db, profile.user_id, periods.previous, periods.start)]);
      const name = profile.name?.trim().split(/\s+/)[0] || "você", report = reportText(name, current, previous), reportMonth = day(periods.start);
      if (dryRun) { results.push({ user_id: profile.user_id, current, previous, report }); continue; }
      const savedResult = await db.from("monthly_reports").upsert({ user_id: profile.user_id, report_month: reportMonth, metrics_json: { current, previous, previous_period_start: day(periods.previous), period_end: day(new Date(periods.end.getTime() - 1)) }, analysis_text: report, report_html: null }, { onConflict: "user_id,report_month" }).select("id").single();
      if (savedResult.error) throw savedResult.error;
      const path = `/meu-espaco?tab=percurso&report=monthly&id=${savedResult.data.id}`, teaser = `Seu relatório mensal está pronto, ${name}. Abra para rever o mês com calma e confirmar o que faz sentido para você.`;
      const notification = await routeNotification(db, { userId: profile.user_id, phone: profile.phone || "", idempotencyKey: `monthly-report:${reportMonth}:${profile.user_id}`, category: "report", type: "report_available", firstName: name, path, whatsappText: `${teaser}\n\nhttps://olaaura.com.br${path}`, whatsappCategory: "weekly_report", teaserText: teaser });
      await db.from("messages").upsert({ user_id: profile.user_id, role: "assistant", content: teaser, client_message_id: `monthly-report:${savedResult.data.id}`, delivery_status: "delivered", metadata: { kind: "report_card", report_type: "monthly", report_id: savedResult.data.id, path, title: "Seu mês em perspectiva", cta: "Abrir meu relatório" } }, { onConflict: "client_message_id" });
      results.push({ user_id: profile.user_id, report_id: savedResult.data.id, channel: notification.channel });
    } catch (profileError) { console.error("Falha no relatório mensal", profile.user_id, profileError); }
    if (!target && (profiles?.length || 0) === BATCH_SIZE) await next(offset + BATCH_SIZE, day(periods.start));
    return Response.json({ status: "ok", processed: results.length, results: dryRun ? results : undefined }, { headers: corsHeaders });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Erro desconhecido" }, { status: 500, headers: corsHeaders }); }
});