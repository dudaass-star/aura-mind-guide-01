import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, MessageCircle, Brain, Calendar, CheckCircle2, TrendingUp } from "lucide-react";
import { SectionHeader, EmptyState, MetricCard, PortalLoadingInline } from "./shared";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

export function ResumosTab({ userId }: { userId: string }) {
  const { data: reports, isLoading } = useQuery({
    queryKey: ["portal-reports", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monthly_reports")
        .select("*")
        .eq("user_id", userId)
        .order("report_month", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  if (isLoading) return <PortalLoadingInline />;

  if (!reports || reports.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Nenhum resumo ainda"
        description="Seu primeiro resumo mensal aparecerá aqui em breve!"
      />
    );
  }

  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];

  const shortMonthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  // Build chart data if 2+ reports
  const chartData = reports.length >= 2
    ? [...reports].reverse().slice(-6).map((r: any) => {
        const d = new Date(r.report_month + "T12:00:00");
        const m = r.metrics_json || {};
        return {
          month: shortMonthNames[d.getMonth()],
          mensagens: m.totalMessages || 0,
          insights: m.insightsCount || 0,
        };
      })
    : null;

  return (
    <div className="space-y-5">
      <SectionHeader icon={BarChart3} title="Resumos Mensais" />

      {/* Evolution chart */}
      {chartData && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm animate-fade-up">
          <div className="flex items-center gap-1.5 mb-4">
            <TrendingUp size={16} className="text-accent" />
            <h3 className="font-['Fraunces'] font-semibold text-foreground text-sm">Sua Evolução</h3>
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={chartData} barGap={4}>
              <XAxis dataKey="month" tick={{ fontSize: 11, fontFamily: "Nunito" }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip
                contentStyle={{ borderRadius: 12, fontFamily: "Nunito", fontSize: 12, border: "1px solid hsl(var(--border))" }}
                cursor={{ fill: "hsl(var(--muted))", radius: 8 }}
              />
              <Bar dataKey="mensagens" name="Mensagens" radius={[6, 6, 0, 0]} maxBarSize={28}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill="hsl(var(--accent))" fillOpacity={0.7 + (i / chartData.length) * 0.3} />
                ))}
              </Bar>
              <Bar dataKey="insights" name="Insights" radius={[6, 6, 0, 0]} maxBarSize={28}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill="hsl(var(--primary))" fillOpacity={0.5 + (i / chartData.length) * 0.5} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center justify-center gap-4 mt-2 text-[10px] text-muted-foreground font-['Nunito']">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-accent inline-block" /> Mensagens</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary inline-block" /> Insights</span>
          </div>
        </div>
      )}

      {reports.map((report: any, idx: number) => {
        const reportDate = new Date(report.report_month + "T12:00:00");
        const monthLabel = `${monthNames[reportDate.getMonth()]} ${reportDate.getFullYear()}`;
        const metrics = report.metrics_json || {};

        return (
          <div
            key={report.id}
            className="rounded-2xl border border-border bg-card p-5 space-y-4 shadow-sm hover:shadow-card transition-all animate-fade-up"
            style={{ animationDelay: `${idx * 100}ms` }}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-['Fraunces'] font-semibold text-foreground text-lg">{monthLabel}</h3>
              <Calendar size={18} className="text-accent" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {metrics.totalMessages != null && (
                <MetricCard icon={MessageCircle} label="Mensagens" value={metrics.totalMessages} />
              )}
              {metrics.insightsCount != null && (
                <MetricCard icon={Brain} label="Insights" value={metrics.insightsCount} />
              )}
              {metrics.sessionsCount != null && (
                <MetricCard icon={Calendar} label="Sessões" value={metrics.sessionsCount} />
              )}
              {metrics.journeysCompleted != null && (
                <MetricCard icon={CheckCircle2} label="Jornadas" value={metrics.journeysCompleted} />
              )}
            </div>

            {metrics.journeyTitle && (
              <div className="bg-accent/5 rounded-xl p-3">
                <p className="text-xs text-accent font-semibold font-['Nunito'] mb-1">Jornada</p>
                <p className="text-sm text-foreground font-['Nunito']">{metrics.journeyTitle}</p>
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent transition-all duration-700"
                      style={{ width: `${((metrics.currentEpisode || 0) / 8) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground font-['Nunito']">
                    {metrics.currentEpisode || 0}/8
                  </span>
                </div>
              </div>
            )}

            {report.analysis_text && (
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingUp size={14} className="text-accent" />
                  <p className="text-xs text-accent font-semibold font-['Nunito']">Sua Evolução</p>
                </div>
                <p className="text-sm text-foreground/90 font-['Nunito'] leading-relaxed">
                  {report.analysis_text}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
