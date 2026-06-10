import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, Loader2, CheckCircle2, XCircle, AlertTriangle, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface SessionRow {
  id: string;
  user_id: string;
  status: string;
  scheduled_at: string;
  started_at: string | null;
  ended_at: string | null;
  duration_minutes: number | null;
  focus_topic: string | null;
  theme_label: string | null;
  profiles?: { name: string | null; phone: string | null; plan: string | null } | null;
}

interface CoverageAnalysis {
  id: string;
  session_id: string;
  analyzed_at: string;
  model: string;
  overall_score: number | null;
  diagnosis: string | null;
  red_flags: string[];
  coverage: {
    camadas: Record<"fato" | "emocao" | "crenca" | "origem", { coberta: boolean; evidencia: string | null }>;
    fases: Record<"presenca" | "sentido" | "movimento", { coberta: boolean; comentario: string }>;
    reframe: { emergiu: boolean; como_hipotese_aberta: boolean; qualidade_1_5: number; trecho: string | null };
    fechamento: { formato_cardapio: string | null; usuario_se_comprometeu: boolean; trecho: string | null };
  };
}

const RED_FLAG_LABEL: Record<string, string> = {
  dramatizacao: "Dramatização",
  perguntas_socraticas_vazias: "Perguntas socráticas vazias",
  reframe_imposto_sem_hipotese: "Reframe imposto sem hipótese",
  clock_muleta_acionado: "Muleta de clock acionada",
  fechamento_forcado_sem_material: "Fechamento forçado sem material",
  concordancia_passiva_tratada_como_reflexao: "Concordância passiva = reflexão",
  interrupcao_fase_presenca: "Interrupção da fase de presença",
};

function fmt(dt: string | null) {
  if (!dt) return "—";
  try {
    return format(new Date(dt), "dd/MM HH:mm", { locale: ptBR });
  } catch {
    return dt;
  }
}

function PlanBadge({ plan }: { plan: string | null | undefined }) {
  if (!plan) return null;
  return <Badge variant="outline" className="capitalize">{plan}</Badge>;
}

export default function AdminSessions() {
  const { isLoading: authLoading, isAdmin } = useAdminAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [upcoming, setUpcoming] = useState<SessionRow[]>([]);
  const [completed, setCompleted] = useState<SessionRow[]>([]);
  const [analyses, setAnalyses] = useState<Record<string, CoverageAnalysis>>({});
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      // Amanhã 00:00 BRT (UTC-3). Compor manualmente para evitar drift de TZ.
      const now = new Date();
      const tomorrowBRT = new Date(now);
      tomorrowBRT.setUTCHours(3, 0, 0, 0); // 00h BRT = 03h UTC
      if (tomorrowBRT.getTime() <= now.getTime()) {
        tomorrowBRT.setUTCDate(tomorrowBRT.getUTCDate() + 1);
      }
      const tomorrowISO = tomorrowBRT.toISOString();

      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const SELECT = "id, user_id, status, scheduled_at, started_at, ended_at, duration_minutes, focus_topic, theme_label";
      const [upcomingRes, completedRes] = await Promise.all([
        supabase
          .from("sessions")
          .select(SELECT)
          .gte("scheduled_at", tomorrowISO)
          .in("status", ["scheduled"])
          .order("scheduled_at", { ascending: true })
          .limit(50),
        supabase
          .from("sessions")
          .select(SELECT)
          .eq("status", "completed")
          .gte("ended_at", thirtyDaysAgo)
          .order("ended_at", { ascending: false })
          .limit(80),
      ]);

      if (upcomingRes.error) console.error(upcomingRes.error);
      if (completedRes.error) console.error(completedRes.error);

      const upcomingRows = (upcomingRes.data ?? []) as unknown as SessionRow[];
      const completedRows = (completedRes.data ?? []) as unknown as SessionRow[];

      // Junta profiles em uma única query (FK não existe — join manual).
      const allUserIds = Array.from(new Set([...upcomingRows, ...completedRows].map((r) => r.user_id)));
      const profilesMap: Record<string, { name: string | null; phone: string | null; plan: string | null }> = {};
      if (allUserIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, name, phone, plan")
          .in("user_id", allUserIds);
        (profs ?? []).forEach((p: any) => {
          profilesMap[p.user_id] = { name: p.name, phone: p.phone, plan: p.plan };
        });
      }
      const attach = (rows: SessionRow[]) => rows.map((r) => ({ ...r, profiles: profilesMap[r.user_id] ?? null }));
      setUpcoming(attach(upcomingRows));
      setCompleted(attach(completedRows));

      // Buscar análises existentes para as completed
      const ids = completedRows.map((r) => r.id);
      if (ids.length > 0) {
        const { data: anaRows } = await supabase
          .from("session_coverage_analyses")
          .select("*")
          .in("session_id", ids);
        const map: Record<string, CoverageAnalysis> = {};
        (anaRows ?? []).forEach((a: any) => { map[a.session_id] = a as CoverageAnalysis; });
        setAnalyses(map);
      } else {
        setAnalyses({});
      }
    } catch (err) {
      console.error(err);
      toast({ title: "Erro ao carregar sessões", description: String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!authLoading && isAdmin) loadData();
  }, [authLoading, isAdmin]);

  async function runAnalysis(sessionId: string, force = false) {
    setAnalyzing(sessionId);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-session-coverage", {
        body: { session_id: sessionId, force },
      });
      if (error) throw error;
      if (!data?.ok || !data.analysis) {
        throw new Error(data?.error || "resposta inválida do analisador");
      }
      setAnalyses((prev) => ({ ...prev, [sessionId]: data.analysis as CoverageAnalysis }));
      setExpandedId(sessionId);
      toast({ title: data.cached ? "Análise carregada do cache" : "Análise concluída" });
    } catch (err: any) {
      console.error(err);
      toast({
        title: "Falha ao analisar sessão",
        description: err?.message ?? String(err),
        variant: "destructive",
      });
    } finally {
      setAnalyzing(null);
    }
  }

  const completedSorted = useMemo(() => completed, [completed]);

  if (authLoading) {
    return <div className="p-6"><Skeleton className="h-8 w-48" /></div>;
  }
  if (!isAdmin) {
    return <div className="p-6">Acesso restrito.</div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/engajamento")} aria-label="Voltar">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl md:text-2xl font-semibold">Auditoria de sessões</h1>
            <p className="text-sm text-muted-foreground">Cobertura das 4 camadas e 3 fases por sessão.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </header>

      <Tabs defaultValue="completed">
        <TabsList>
          <TabsTrigger value="completed">Para auditar ({completedSorted.length})</TabsTrigger>
          <TabsTrigger value="upcoming">Próximas ({upcoming.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="completed" className="mt-4">
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : completedSorted.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Nenhuma sessão concluída nos últimos 30 dias.</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {completedSorted.map((s) => {
                const ana = analyses[s.id];
                const expanded = expandedId === s.id;
                return (
                  <Card key={s.id}>
                    <CardHeader className="pb-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                            {s.profiles?.name || "Sem nome"}
                            <PlanBadge plan={s.profiles?.plan} />
                            {ana && (
                              <Badge variant={ana.overall_score && ana.overall_score >= 4 ? "default" : ana.overall_score && ana.overall_score <= 2 ? "destructive" : "secondary"}>
                                Nota {ana.overall_score ?? "?"}/5
                              </Badge>
                            )}
                          </CardTitle>
                          <p className="text-xs text-muted-foreground mt-1">
                            Encerrada {fmt(s.ended_at)} · {s.duration_minutes ?? "?"} min
                            {s.theme_label && <> · <span className="italic">{s.theme_label}</span></>}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          {ana ? (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => setExpandedId(expanded ? null : s.id)}>
                                {expanded ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
                                {expanded ? "Recolher" : "Ver análise"}
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => runAnalysis(s.id, true)} disabled={analyzing === s.id}>
                                {analyzing === s.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                                Re-analisar
                              </Button>
                            </>
                          ) : (
                            <Button size="sm" onClick={() => runAnalysis(s.id)} disabled={analyzing === s.id}>
                              {analyzing === s.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                              Analisar
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    {ana && expanded && <CardContent><AnalysisDetails ana={ana} /></CardContent>}
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="upcoming" className="mt-4">
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : upcoming.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Nenhuma sessão agendada a partir de amanhã.</CardContent></Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Plano</TableHead>
                      <TableHead>Agendada para</TableHead>
                      <TableHead>Tema</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {upcoming.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.profiles?.name || "—"}</TableCell>
                        <TableCell><PlanBadge plan={s.profiles?.plan} /></TableCell>
                        <TableCell className="text-sm">{fmt(s.scheduled_at)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground italic">{s.focus_topic || s.theme_label || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CheckRow({ ok, label, detail }: { ok: boolean; label: string; detail?: string | null }) {
  return (
    <div className="flex items-start gap-2 py-1">
      {ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" /> : <XCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />}
      <div className="text-sm">
        <span className="font-medium">{label}</span>
        {detail && <p className="text-muted-foreground text-xs mt-0.5">{detail}</p>}
      </div>
    </div>
  );
}

function AnalysisDetails({ ana }: { ana: CoverageAnalysis }) {
  const { camadas, fases, reframe, fechamento } = ana.coverage;
  // Falso-positivo de "coberta=true" sem evidência literal → trata como false na UI.
  const safeLayer = (l: { coberta: boolean; evidencia: string | null }) => ({
    coberta: l.coberta && !!(l.evidencia && l.evidencia.trim().length > 0),
    evidencia: l.evidencia,
  });
  return (
    <div className="space-y-5 pt-2">
      <div className="grid md:grid-cols-2 gap-5">
        <section>
          <h4 className="text-sm font-semibold mb-2">Camadas investigativas</h4>
          {(["fato", "emocao", "crenca", "origem"] as const).map((k) => {
            const l = safeLayer(camadas[k]);
            return <CheckRow key={k} ok={l.coberta} label={k.toUpperCase()} detail={l.evidencia} />;
          })}
        </section>
        <section>
          <h4 className="text-sm font-semibold mb-2">Fases</h4>
          {(["presenca", "sentido", "movimento"] as const).map((k) => (
            <CheckRow key={k} ok={fases[k].coberta} label={k.charAt(0).toUpperCase() + k.slice(1)} detail={fases[k].comentario} />
          ))}
        </section>
      </div>

      <section>
        <h4 className="text-sm font-semibold mb-2">Reframe</h4>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={reframe.emergiu ? "default" : "destructive"}>
            {reframe.emergiu ? "Emergiu" : "Não emergiu"}
          </Badge>
          {reframe.emergiu && (
            <Badge variant={reframe.como_hipotese_aberta ? "secondary" : "destructive"}>
              {reframe.como_hipotese_aberta ? "Como hipótese aberta" : "Imposto"}
            </Badge>
          )}
          <Badge variant="outline">Qualidade {reframe.qualidade_1_5}/5</Badge>
        </div>
        {reframe.trecho && <p className="text-xs italic text-muted-foreground mt-2">"{reframe.trecho}"</p>}
      </section>

      <section>
        <h4 className="text-sm font-semibold mb-2">Fechamento</h4>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{fechamento.formato_cardapio ?? "nenhum"}</Badge>
          <Badge variant={fechamento.usuario_se_comprometeu ? "default" : "secondary"}>
            {fechamento.usuario_se_comprometeu ? "Usuário se comprometeu" : "Sem compromisso concreto"}
          </Badge>
        </div>
        {fechamento.trecho && <p className="text-xs italic text-muted-foreground mt-2">"{fechamento.trecho}"</p>}
      </section>

      {ana.red_flags.length > 0 && (
        <section>
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" /> Red flags
          </h4>
          <div className="flex flex-wrap gap-2">
            {ana.red_flags.map((rf) => (
              <Badge key={rf} variant="destructive">{RED_FLAG_LABEL[rf] ?? rf}</Badge>
            ))}
          </div>
        </section>
      )}

      {ana.diagnosis && (
        <section>
          <h4 className="text-sm font-semibold mb-2">Diagnóstico</h4>
          <p className="text-sm whitespace-pre-line leading-relaxed">{ana.diagnosis}</p>
        </section>
      )}

      <p className="text-[10px] text-muted-foreground pt-2 border-t">
        Analisada em {fmt(ana.analyzed_at)} · modelo {ana.model}
      </p>
    </div>
  );
}