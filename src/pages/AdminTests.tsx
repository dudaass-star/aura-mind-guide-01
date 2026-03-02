import { useState, useEffect } from 'react';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, Play, CheckCircle, XCircle, AlertTriangle, Clock, Loader2 } from 'lucide-react';

interface Validation {
  check: string;
  passed: boolean;
  detail?: string;
}

interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'warning';
  duration_ms: number;
  details: any;
  validations: Validation[];
}

interface TestResponse {
  status: string;
  summary: {
    total: number;
    pass: number;
    fail: number;
    warning: number;
    total_duration_ms: number;
  };
  verdict: string;
  suggestions: string[];
  results: TestResult[];
}

const statusConfig = {
  pass: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/10 border-green-500/20', badge: 'bg-green-500/20 text-green-700' },
  fail: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10 border-red-500/20', badge: 'bg-red-500/20 text-red-700' },
  warning: { icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-yellow-500/10 border-yellow-500/20', badge: 'bg-yellow-500/20 text-yellow-700' },
};

export default function AdminTests() {
  const { isLoading: authLoading, isAdmin, redirectIfNotAdmin } = useAdminAuth();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [data, setData] = useState<TestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedTests, setExpandedTests] = useState<Set<number>>(new Set());

  useEffect(() => {
    redirectIfNotAdmin();
  }, [authLoading, isAdmin]);

  const runTests = async () => {
    setRunning(true);
    setData(null);
    setError(null);
    setProgress(5);

    // Simulate progress while waiting
    const progressInterval = setInterval(() => {
      setProgress(prev => Math.min(prev + 2, 90));
    }, 3000);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/run-system-tests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      clearInterval(progressInterval);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const result: TestResponse = await res.json();
      setData(result);
      setProgress(100);

      // Save to localStorage history
      const history = JSON.parse(localStorage.getItem('aura-test-history') || '[]');
      history.unshift({ date: new Date().toISOString(), summary: result.summary, verdict: result.verdict });
      localStorage.setItem('aura-test-history', JSON.stringify(history.slice(0, 5)));
    } catch (err: any) {
      clearInterval(progressInterval);
      setError(err.message || 'Erro ao executar testes');
    } finally {
      setRunning(false);
    }
  };

  const toggleExpanded = (index: number) => {
    setExpandedTests(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">🧪 Simulador de Testes</h1>
            <p className="text-muted-foreground text-sm mt-1">Bateria completa de testes automatizados do sistema Aura</p>
          </div>
          <Button onClick={runTests} disabled={running} size="lg">
            {running ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Executando...</>
            ) : (
              <><Play className="mr-2 h-4 w-4" /> Executar Todos os Testes</>
            )}
          </Button>
        </div>

        {/* Progress */}
        {running && (
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Executando testes...</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} />
                <p className="text-xs text-muted-foreground">
                  Isso pode levar 1-2 minutos (sessão completa de 45min simulada)
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error */}
        {error && (
          <Card className="border-destructive bg-destructive/5">
            <CardContent className="pt-6">
              <p className="text-destructive font-medium">❌ Erro: {error}</p>
            </CardContent>
          </Card>
        )}

        {/* Verdict */}
        {data && (
          <Card className={data.summary.fail > 0 ? 'border-red-500/30 bg-red-500/5' : 'border-green-500/30 bg-green-500/5'}>
            <CardHeader>
              <CardTitle className="text-lg">Veredicto Final</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-base font-medium">{data.verdict}</p>

              {data.suggestions.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Sugestões de melhoria:</p>
                  <ul className="space-y-1">
                    {data.suggestions.map((s, i) => (
                      <li key={i} className="text-sm flex items-start gap-2">
                        <span className="text-yellow-500 mt-0.5">💡</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex gap-4 text-sm text-muted-foreground pt-2 border-t">
                <span>✅ {data.summary.pass} pass</span>
                <span>⚠️ {data.summary.warning} warning</span>
                <span>❌ {data.summary.fail} fail</span>
                <span className="ml-auto">
                  <Clock className="inline h-3 w-3 mr-1" />
                  {(data.summary.total_duration_ms / 1000).toFixed(1)}s total
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Test Results */}
        {data?.results.map((result, index) => {
          const config = statusConfig[result.status];
          const StatusIcon = config.icon;
          const isExpanded = expandedTests.has(index);

          return (
            <Collapsible key={index} open={isExpanded} onOpenChange={() => toggleExpanded(index)}>
              <Card className={`border ${config.bg}`}>
                <CollapsibleTrigger className="w-full">
                  <CardHeader className="flex flex-row items-center justify-between py-4">
                    <div className="flex items-center gap-3">
                      <StatusIcon className={`h-5 w-5 ${config.color}`} />
                      <div className="text-left">
                        <CardTitle className="text-base">{result.name}</CardTitle>
                        <CardDescription className="text-xs">
                          {result.validations.filter(v => v.passed).length}/{result.validations.length} checks •{' '}
                          {(result.duration_ms / 1000).toFixed(1)}s
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={config.badge}>{result.status.toUpperCase()}</Badge>
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <CardContent className="pt-0 space-y-4">
                    {/* Validations */}
                    <div className="space-y-1">
                      {result.validations.map((v, vi) => (
                        <div key={vi} className="flex items-start gap-2 text-sm py-1">
                          <span className={v.passed ? 'text-green-500' : 'text-red-500'}>
                            {v.passed ? '✓' : '✗'}
                          </span>
                          <span className="flex-1">{v.check}</span>
                          {v.detail && (
                            <span className="text-xs text-muted-foreground max-w-[300px] truncate">
                              {v.detail}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Conversation Log for session test */}
                    {result.details?.conversationLog && (
                      <div className="space-y-2 border-t pt-3">
                        <p className="text-sm font-medium text-muted-foreground">Log da Sessão:</p>
                        <div className="space-y-2 max-h-96 overflow-y-auto">
                          {result.details.conversationLog.map((log: any, li: number) => (
                            <div key={li} className="text-xs space-y-1 border-b border-border/50 pb-2">
                              <div className="flex gap-2 items-center">
                                <Badge variant="outline" className="text-[10px] py-0">{log.phase}</Badge>
                                <span className="text-muted-foreground">{log.elapsed_min}min</span>
                              </div>
                              <p className="text-foreground">👤 {log.sent}</p>
                              <p className="text-muted-foreground">🤖 {log.received?.substring(0, 200) || '(sem resposta)'}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Responses for conversation tests */}
                    {result.details?.responses && (
                      <div className="space-y-2 border-t pt-3">
                        <p className="text-sm font-medium text-muted-foreground">Respostas da Aura:</p>
                        <div className="space-y-1">
                          {result.details.responses.map((r: string, ri: number) => (
                            <p key={ri} className="text-xs text-muted-foreground border-l-2 border-border pl-2">
                              {r?.substring(0, 200) || '(vazio)'}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Reports for weekly report test */}
                    {result.details?.reports && result.details.reports.length > 0 && (
                      <div className="space-y-2 border-t pt-3">
                        <p className="text-sm font-medium text-muted-foreground">Relatório Gerado:</p>
                        <pre className="text-xs bg-muted p-3 rounded overflow-x-auto whitespace-pre-wrap">
                          {result.details.reports[0]?.report || '(vazio)'}
                        </pre>
                      </div>
                    )}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}
