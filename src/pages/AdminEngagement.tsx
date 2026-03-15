import { useEffect, useState } from 'react';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Users, MessageSquare, Clock, BarChart3, RefreshCw, TrendingUp, UserPlus, Percent, Timer, XCircle, ArrowRightLeft, ArrowDown, Send, CalendarIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Metrics {
  activeUsers: number;
  weeklyMessages: number;
  weeklySessionsCount: number;
  avgSessionMinutes: number;
  messagesPerSession: number;
  returnRate: number;
  uniqueRecentUsers: number;
  avgDailyMessagesPerUser: number;
  // Trial & Conversion
  activeTrials: number;
  trialsLast7Days: number;
  trialsLast30Days: number;
  totalTrialsEver: number;
  trialRespondedCount: number;
  trialCompletedCount: number;
  convertedCount: number;
  conversionRate: number;
  expiredTrials: number;
  avgDaysToConversion: number;
  avgMsgsConverted: number;
  avgMsgsNonConverted: number;
  canceledUsers: number;
  cancelingUsers: number;
}

export default function AdminEngagement() {
  const { isLoading, isAdmin, redirectIfNotAdmin } = useAdminAuth();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [blasting, setBlasting] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date>(subDays(new Date(), 7));
  const [dateTo, setDateTo] = useState<Date>(new Date());
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading) redirectIfNotAdmin();
  }, [isLoading, isAdmin]);

  const fetchMetrics = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const { data, error } = await supabase.functions.invoke('admin-engagement-metrics', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          dateFrom: startOfDay(dateFrom).toISOString(),
          dateTo: endOfDay(dateTo).toISOString(),
        },
      });

      if (error) throw error;
      setMetrics(data);
    } catch (err: unknown) {
      console.error('Error fetching metrics:', err);
      toast({
        title: 'Erro ao carregar métricas',
        description: err instanceof Error ? err.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) fetchMetrics();
  }, [isAdmin]);

  const handleReactivationBlast = async () => {
    if (!confirm('Enviar mensagem de reativação para todos os trials finalizados?')) return;
    setBlasting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const { data, error } = await supabase.functions.invoke('reactivation-blast', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error) throw error;
      toast({
        title: 'Disparo concluído!',
        description: `${data.sent} mensagens enviadas${data.errors > 0 ? `, ${data.errors} erros` : ''}.`,
      });
    } catch (err: unknown) {
      toast({
        title: 'Erro no disparo',
        description: err instanceof Error ? err.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setBlasting(false);
    }
  };

  if (isLoading || !isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  const engagementCards = metrics ? [
    { title: 'Usuários Ativos', value: metrics.activeUsers, icon: Users, subtitle: 'status = active' },
    { title: 'Mensagens na Semana', value: metrics.weeklyMessages, icon: MessageSquare, subtitle: 'últimos 7 dias' },
    { title: 'Sessões Completadas', value: metrics.weeklySessionsCount, icon: BarChart3, subtitle: 'últimos 7 dias' },
    { title: 'Tempo Médio de Sessão', value: `${metrics.avgSessionMinutes} min`, icon: Clock, subtitle: 'sessões completadas' },
    { title: 'Mensagens por Sessão', value: metrics.messagesPerSession, icon: MessageSquare, subtitle: 'msgs do usuário durante sessão' },
    { title: 'Média Msgs/Dia por Usuário', value: metrics.avgDailyMessagesPerUser, icon: TrendingUp, subtitle: 'últimos 7 dias / ativos' },
    { title: 'Taxa de Retorno', value: `${metrics.returnRate}%`, icon: TrendingUp, subtitle: `${metrics.uniqueRecentUsers} de ${metrics.activeUsers} ativos` },
  ] : [];

  const trialCards = metrics ? [
    { title: 'Trials Ativos', value: metrics.activeTrials, icon: UserPlus, subtitle: 'status = trial agora' },
    { title: 'Trials (7 dias)', value: metrics.trialsLast7Days, icon: UserPlus, subtitle: 'iniciados nos últimos 7 dias' },
    { title: 'Trials (30 dias)', value: metrics.trialsLast30Days, icon: UserPlus, subtitle: 'iniciados nos últimos 30 dias' },
    { title: 'Total Trials (histórico)', value: metrics.totalTrialsEver, icon: Users, subtitle: 'todos os trials já criados' },
    { title: 'Convertidos', value: metrics.convertedCount, icon: ArrowRightLeft, subtitle: 'trial → assinante' },
    { title: 'Taxa de Conversão', value: `${metrics.conversionRate}%`, icon: Percent, subtitle: `${metrics.convertedCount} de ${metrics.totalTrialsEver} trials` },
    { title: 'Trials Expirados', value: metrics.expiredTrials, icon: XCircle, subtitle: 'trial há mais de 7 dias sem converter' },
    { title: 'Tempo Médio até Conversão', value: `${metrics.avgDaysToConversion} dias`, icon: Timer, subtitle: 'trial_started_at → ativação' },
    { title: 'Msgs Trial (Convertidos)', value: metrics.avgMsgsConverted, icon: MessageSquare, subtitle: 'média de msgs durante trial' },
    { title: 'Msgs Trial (Não Convertidos)', value: metrics.avgMsgsNonConverted, icon: MessageSquare, subtitle: 'média de msgs durante trial' },
    { title: 'Cancelados', value: metrics.canceledUsers, icon: XCircle, subtitle: 'status = canceled' },
    { title: 'Cancelando', value: metrics.cancelingUsers, icon: Clock, subtitle: 'aguardando fim do período' },
  ] : [];

  const SkeletonCards = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {[...Array(6)].map((_, i) => (
        <Card key={i} className="animate-pulse">
          <CardHeader className="pb-2"><div className="h-4 bg-muted rounded w-32" /></CardHeader>
          <CardContent><div className="h-8 bg-muted rounded w-20" /></CardContent>
        </Card>
      ))}
    </div>
  );

  const MetricCards = ({ cards }: { cards: typeof engagementCards }) => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
            <card.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{card.value}</div>
            <p className="text-xs text-muted-foreground mt-1">{card.subtitle}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  const FunnelStep = ({ label, value, total, color }: { label: string; value: number; total: number; color: string }) => {
    const pct = total > 0 ? Math.round(value / total * 100) : 0;
    return (
      <div className="space-y-1.5">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-semibold text-foreground">{value} <span className="text-muted-foreground font-normal">({pct}%)</span></span>
        </div>
        <div className="h-4 bg-muted rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.max(pct, 2)}%` }} />
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/admin/configuracoes')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold text-foreground">Métricas de Engajamento</h1>
          </div>
          <Button variant="outline" size="sm" onClick={fetchMetrics} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>

        <Tabs defaultValue="engagement" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="engagement">Engajamento</TabsTrigger>
            <TabsTrigger value="trial">Trial & Conversão</TabsTrigger>
          </TabsList>

          <TabsContent value="engagement" className="mt-4">
            {loading && !metrics ? <SkeletonCards /> : <MetricCards cards={engagementCards} />}
          </TabsContent>

          <TabsContent value="trial" className="mt-4 space-y-6">
            {loading && !metrics ? <SkeletonCards /> : (
              <>
                {/* Funil de Conversão */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <ArrowDown className="h-4 w-4" />
                      Funil de Conversão do Trial
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {metrics && (
                      <>
                        <FunnelStep label="Cadastraram (iniciaram trial)" value={metrics.totalTrialsEver} total={metrics.totalTrialsEver} color="bg-blue-500" />
                        <FunnelStep label="Responderam (1+ mensagem)" value={metrics.trialRespondedCount} total={metrics.totalTrialsEver} color="bg-cyan-500" />
                        <FunnelStep label="Completaram 5 conversas" value={metrics.trialCompletedCount} total={metrics.totalTrialsEver} color="bg-amber-500" />
                        <FunnelStep label="Assinaram" value={metrics.convertedCount} total={metrics.totalTrialsEver} color="bg-green-500" />
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* Botão de Reativação */}
                <Card>
                  <CardContent className="flex items-center justify-between py-4">
                    <div>
                      <p className="font-medium text-foreground">Reativar Trials Finalizados</p>
                      <p className="text-xs text-muted-foreground">Envia mensagem conversacional e reseta contador para continuar o fluxo de trial</p>
                    </div>
                    <Button onClick={handleReactivationBlast} disabled={blasting} variant="outline" size="sm">
                      <Send className={`h-4 w-4 mr-2 ${blasting ? 'animate-pulse' : ''}`} />
                      {blasting ? 'Enviando...' : 'Disparar'}
                    </Button>
                  </CardContent>
                </Card>

                {/* Cards detalhados */}
                <MetricCards cards={trialCards} />
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
