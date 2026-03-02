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

const TEST_QUEUE = [
  { key: 'casual', label: 'Conversa Casual', emoji: '💬' },
  { key: 'emotional', label: 'Conversa Emocional', emoji: '💜' },
  { key: 'session', label: 'Sessão Completa', emoji: '🧘' },
  { key: 'report', label: 'Relatório Semanal', emoji: '📊' },
  { key: 'checkin', label: 'Check-in Agendado', emoji: '🔔' },
  { key: 'followup', label: 'Follow-up de Conversa', emoji: '🔄' },
];

const statusConfig = {
  pass: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/10 border-green-500/20', badge: 'bg-green-500/20 text-green-700' },
  fail: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10 border-red-500/20', badge: 'bg-red-500/20 text-red-700' },
  warning: { icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-yellow-500/10 border-yellow-500/20', badge: 'bg-yellow-500/20 text-yellow-700' },
};

export default function AdminTests() {
  const { isLoading: authLoading, isAdmin, redirectIfNotAdmin } = useAdminAuth();
  const [running, setRunning] = useState(false);
  const [currentTest, setCurrentTest] = useState<string | null>(null);
  const [completedTests, setCompletedTests] = useState(0);
  const [results, setResults] = useState<TestResult[]>([]);
  const [verdictData, setVerdictData] = useState<{ verdict: string; suggestions: string[]; summary: TestResponse['summary'] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedTests, setExpandedTests] = useState<Set<number>>(new Set());

  useEffect(() => {
    redirectIfNotAdmin();
  }, [authLoading, isAdmin]);

  const runTests = async () => {
    setRunning(true);
    setResults([]);
    setVerdictData(null);
    setError(null);
    setCompletedTests(0);
    setCurrentTest(null);

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const collectedResults: TestResult[] = [];

    try {
      // Run each test individually
      for (let i = 0; i < TEST_QUEUE.length; i++) {
        const test = TEST_QUEUE[i];
        setCurrentTest(test.key);
        setCompletedTests(i);

        const res = await fetch(`${supabaseUrl}/functions/v1/run-system-tests`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ test: test.key }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(`${test.label}: ${errData.error || `HTTP ${res.status}`}`);
        }

        const data = await res.json();
        if (data.result) {
          collectedResults.push(data.result);
          setResults([...collectedResults]);
        }
      }

      // Generate verdict
      setCurrentTest('verdict');
      const verdictRes = await fetch(`${supabaseUrl}/functions/v1/run-system-tests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: 'verdict', results: collectedResults }),
      });

      if (verdictRes.ok) {
        const verdictJson = await verdictRes.json();
        setVerdictData({
          verdict: verdictJson.verdict,
          suggestions: verdictJson.suggestions || [],
          summary: verdictJson.summary,
        });
      }

      setCompletedTests(TEST_QUEUE.length);
      setCurrentTest(null);

      // Save to history
      const totalDuration = collectedResults.reduce((sum, r) => sum + r.duration_ms, 0);
      const summary = {
        total: collectedResults.length,
        pass: collectedResults.filter(r => r.status === 'pass').length,
        fail: collectedResults.filter(r => r.status === 'fail').length,
        warning: collectedResults.filter(r => r.status === 'warning').length,
        total_duration_ms: totalDuration,
      };
      const history = JSON.parse(localStorage.getItem('aura-test-history') || '[]');
      history.unshift({ date: new Date().toISOString(), summary });
      localStorage.setItem('aura-test-history', JSON.stringify(history.slice(0, 5)));
    } catch (err: any) {
      setError(err.message || 'Erro ao executar testes');
    } finally {
      setRunning(false);
      setCurrentTest(null);
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

  const progress = running
    ? ((completedTests + (currentTest === 'verdict' ? 0.5 : 0)) / (TEST_QUEUE.length + 1)) * 100
    : results.length > 0 ? 100 : 0;

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
                  <span>
                    {currentTest === 'verdict'
                      ? '🤖 Gerando veredicto...'
                      : currentTest
                        ? `${TEST_QUEUE.find(t => t.key === currentTest)?.emoji || ''} ${TEST_QUEUE.find(t => t.key === currentTest)?.label || currentTest}...`
                        : 'Preparando...'}
                  </span>
                  <span>{completedTests}/{TEST_QUEUE.length} testes</span>
                </div>
                <Progress value={progress} />
                <p className="text-xs text-muted-foreground">
                  Cada teste é executado individualmente (~30-90s por teste)
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
        {verdictData && (
          <Card className={verdictData.summary.fail > 0 ? 'border-red-500/30 bg-red-500/5' : 'border-green-500/30 bg-green-500/5'}>
            <CardHeader>
              <CardTitle className="text-lg">Veredicto Final</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-base font-medium">{verdictData.verdict}</p>

              {verdictData.suggestions.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Sugestões de melhoria:</p>
                  <ul className="space-y-1">
                    {verdictData.suggestions.map((s, i) => (
                      <li key={i} className="text-sm flex items-start gap-2">
                        <span className="text-yellow-500 mt-0.5">💡</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex gap-4 text-sm text-muted-foreground pt-2 border-t">
                <span>✅ {verdictData.summary.pass} pass</span>
                <span>⚠️ {verdictData.summary.warning} warning</span>
                <span>❌ {verdictData.summary.fail} fail</span>
                <span className="ml-auto">
                  <Clock className="inline h-3 w-3 mr-1" />
                  {(verdictData.summary.total_duration_ms / 1000).toFixed(1)}s total
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Test Results */}
        {results.map((result, index) => {
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
