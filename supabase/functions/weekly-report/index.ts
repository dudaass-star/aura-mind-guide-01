import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { routeNotification } from "../_shared/notification-router.ts";
import { formatReport, generateReportAnalysis, type PeriodMetrics } from "../_shared/report-intelligence.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const BATCH_SIZE = 20;

type ReportMetrics = { current: PeriodMetrics; previous: PeriodMetrics };

function brtParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function dateOnly(date: Date) { return date.toISOString().slice(0, 10); }

function getWeeklyPeriods(now = new Date()) {
  const brt = brtParts(now);
  const todayUtc = new Date(`${brt.year}-${brt.month}-${brt.day}T03:00:00.000Z`);
  const day = todayUtc.getUTCDay();
  const currentStart = new Date(todayUtc);
  currentStart.setUTCDate(todayUtc.getUTCDate() - (day === 0 ? 13 : day + 6));
  const currentEndExclusive = new Date(currentStart); currentEndExclusive.setUTCDate(currentStart.getUTCDate() + 7);
  const previousStart = new Date(currentStart); previousStart.setUTCDate(currentStart.getUTCDate() - 7);
  return { previousStart, currentStart, currentEndExclusive };
}

async function countBetween(query: any, column: string, start: Date, end: Date) {
  const { count, error } = await query.gte(column, start.toISOString()).lt(column, end.toISOString());
  if (error) throw error;
  return count || 0;
}

async function fetchMetrics(supabase: any, userId: string, start: Date, end: Date): Promise<PeriodMetrics> {
  const [messages, sessions, journeys, practices] = await Promise.all([
    countBetween(supabase.from("messages").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("role", "user"), "created_at", start, end),
    countBetween(supabase.from("sessions").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "completed"), "ended_at", start, end),
    countBetween(supabase.from("user_journey_history").select("id", { count: "exact", head: true }).eq("user_id", userId), "completed_at", start, end),
    countBetween(supabase.from("user_meditation_history").select("id", { count: "exact", head: true }).eq("user_id", userId), "sent_at", start, end),
  ]);
  return { messages, sessions, journeys, practices };
}

function deltaLabel(current: number, previous: number) {
  if (current === previous) return "mesmo ritmo da semana anterior";
  const diff = Math.abs(current - previous);
  return current > previous ? `${diff} a mais que na semana anterior` : `${diff} a menos que na semana anterior`;
}

function buildHighlights(metrics: ReportMetrics) {
  const items = [
    { key: "messages", label: "mensagens enviadas", current: metrics.current.messages, previous: metrics.previous.messages },
    { key: "sessions", label: "sessões", current: metrics.current.sessions, previous: metrics.previous.sessions },
    { key: "journeys", label: "episódios de Jornadas", current: metrics.current.journeys, previous: metrics.previous.journeys },
    { key: "practices", label: "práticas", current: metrics.current.practices, previous: metrics.previous.practices },
  ];
  return items.filter((item) => item.current > 0 || item.previous > 0).map((item) => ({ ...item, comparison: deltaLabel(item.current, item.previous) }));
}

async function invokeNext(offset: number, periodStart: string) {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/weekly-report`;
  await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` }, body: JSON.stringify({ offset, period_start: periodStart }) });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const offset = Number(body.offset || 0);
    const targetUserId = typeof body.target_user_id === "string" ? body.target_user_id : null;
    const nowParts = brtParts();
    const hour = Number(nowParts.hour);
    if (!targetUserId && (hour < 8 || hour >= 22)) return new Response(JSON.stringify({ status: "skipped", reason: "quiet_hours" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const dryRun = body.dry_run === true;
    const periods = body.period_start
      ? { currentStart: new Date(`${body.period_start}T03:00:00Z`), currentEndExclusive: new Date(new Date(`${body.period_start}T03:00:00Z`).getTime() + 7 * 86400000), previousStart: new Date(new Date(`${body.period_start}T03:00:00Z`).getTime() - 7 * 86400000) }
      : getWeeklyPeriods();
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    let query = supabase.from("profiles").select("user_id,name,phone,status,do_not_disturb_until").eq("status", "active").order("created_at", { ascending: true });
    query = targetUserId ? query.eq("user_id", targetUserId) : query.range(offset, offset + BATCH_SIZE - 1);
    const { data: profiles, error } = await query;
    if (error) throw error;
    const results: unknown[] = [];
    for (const profile of profiles || []) {
      try {
        const [current, previous] = await Promise.all([
          fetchMetrics(supabase, profile.user_id, periods.currentStart, periods.currentEndExclusive),
          fetchMetrics(supabase, profile.user_id, periods.previousStart, periods.currentStart),
        ]);
        const metrics = { current, previous };
        const highlights = buildHighlights(metrics);
        const name = profile.name?.trim().split(/\s+/)[0] || "você";
        const analysis = await generateReportAnalysis(supabase, { kind: "weekly", userId: profile.user_id, firstName: name, start: periods.currentStart, end: periods.currentEndExclusive, previousStart: periods.previousStart, metrics });
        const report = formatReport(analysis, current);
        if (dryRun) { results.push({ user_id: profile.user_id, metrics, highlights, analysis, report }); continue; }
        const { data: saved, error: saveError } = await supabase.from("weekly_reports").upsert({
          user_id: profile.user_id,
          period_start: dateOnly(periods.currentStart),
          period_end: dateOnly(new Date(periods.currentEndExclusive.getTime() - 1)),
          previous_period_start: dateOnly(periods.previousStart),
          previous_period_end: dateOnly(new Date(periods.currentStart.getTime() - 1)),
          metrics_json: metrics,
          highlights_json: highlights,
          evidence_json: analysis.evidence,
          analysis_text: analysis.observation,
          continuation_text: analysis.continuation,
          report_content: report,
        }, { onConflict: "user_id,period_start" }).select("id").single();
        if (saveError) throw saveError;
        const path = `/meu-espaco?tab=percurso&report=weekly&id=${saved.id}`;
        const teaser = `Seu resumo da semana está pronto, ${name}. Abra para ver o que ganhou continuidade e escolher o próximo fio.`;
        const notification = await routeNotification(supabase, {
          userId: profile.user_id,
          phone: profile.phone || "",
          idempotencyKey: `weekly-report:${dateOnly(periods.currentStart)}:${profile.user_id}`,
          category: "report",
          type: "report_available",
          firstName: name,
          path,
          whatsappText: `${teaser}\n\nhttps://olaaura.com.br${path}`,
          whatsappCategory: "weekly_report",
          teaserText: teaser,
        });
        await supabase.from("messages").upsert({
          user_id: profile.user_id,
          role: "assistant",
          content: teaser,
          client_message_id: `weekly-report:${saved.id}`,
          metadata: { kind: "report_card", report_type: "weekly", report_id: saved.id, path, title: "Sua semana na Olá Aura", cta: "Ver minha semana" },
          delivery_status: "delivered",
        }, { onConflict: "client_message_id" });
        results.push({ user_id: profile.user_id, report_id: saved.id, channel: notification.channel });
      } catch (profileError) { console.error("Falha no resumo semanal", profile.user_id, profileError); }
    }
    if (!targetUserId && (profiles?.length || 0) === BATCH_SIZE) await invokeNext(offset + BATCH_SIZE, dateOnly(periods.currentStart));
    return new Response(JSON.stringify({ status: "ok", processed: results.length, results: dryRun ? results : undefined }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Erro no resumo semanal", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
