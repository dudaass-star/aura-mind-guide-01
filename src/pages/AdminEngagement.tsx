import { useEffect, useRef, useState } from 'react';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Users, MessageSquare, Clock, BarChart3, RefreshCw, TrendingUp, UserPlus, Percent, Timer, XCircle, ArrowRightLeft, ArrowDown, Send, CalendarIcon, DollarSign, UserMinus, ShoppingCart, RotateCcw, CheckCircle2, AlertCircle, CreditCard, Mail } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface CostBreakdown {
  model: string;
  calls: number;
  cost: number;
  cacheSavings: number;
}

interface Metrics {
  activeUsers: number;
  activeUsersBase: number;
  userMessagesInPeriod: number;
  totalMessagesInPeriod: number;
  weeklySessionsCount: number;
  avgSessionMinutes: number;
  messagesPerSession: number;
  returnRate: number;
  uniqueRecentUsers: number;
  avgDailyMessagesPerUser: number;
  // Cost
  totalCostUSD: number;
  avgCostPerActiveUser: number;
  costBreakdownByModel: CostBreakdown[];
  totalCacheSavings: number;
  // Trial & Conversion
  activeTrials: number;
  activeSubscribers: number;
  paymentFailedCount: number;
  expiredTrialsAwaitingPayment: number;
  trialsInPeriod: number;
  trialsWithCardInPeriod: number;
  totalTrialsAllTime: number;
  totalTrialsWithCardAllTime: number;
  trialRespondedCount: number;
  convertedCount: number;
  funnelTotal: number;
  funnelResponded: number;
  funnelConverted: number;
  conversionRate: number;
  expiredTrials: number;
  avgDaysToConversion: number;
  avgMsgsConverted: number;
  avgMsgsNonConverted: number;
  canceledUsers: number;
  cancelingUsers: number;
  trialsByPlan?: { plan: string; count: number }[];
  // Billing
  billingSuccessInPeriod: number;
  billingTotalInPeriod: number;
  billingSuccessRate: number;
  // Checkout funnel
  checkoutCreatedInPeriod: number;
  checkoutCompletedInPeriod: number;
  checkoutDropoffInPeriod: number;
  checkoutCompletionRate: number;
  checkoutCreatedAllTime: number;
  checkoutCompletedAllTime: number;
  // Trial-to-Paid
  trialsCompletedWeek: number;
  trialsToPaidSuccess: number;
  trialToPaidRate: number;
  // Cancellation
  canceledInPeriod: number;
  pausedInPeriod: number;
  churnRate: number;
  cancellationReasons: { reason: string; action_taken: string; count: number }[];
}

interface RecoverySession {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  plan: string | null;
  created_at: string;
  status: string;
  recovery_sent: boolean;
  recovery_sent_at: string | null;
  recovery_last_error: string | null;
  recovery_attempts_count: number;
  converted: boolean;
  attempt_status: string | null;
}

interface DunningAttempt {
  id: string;
  event_id: string;
  customer_id: string;
  invoice_id: string | null;
  phone_raw: string | null;
  phone_resolved: string | null;
  profile_found: boolean;
  link_generated: boolean;
  whatsapp_sent: boolean;
  error_stage: string | null;
  error_message: string | null;
  created_at: string;
}

export default function AdminEngagement() {
  const { isLoading, isAdmin, redirectIfNotAdmin } = useAdminAuth();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [blasting, setBlasting] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date>(new Date());
  const [dateTo, setDateTo] = useState<Date>(new Date());
  const [recoverySessions, setRecoverySessions] = useState<RecoverySession[]>([]);
  const [dunningAttempts, setDunningAttempts] = useState<DunningAttempt[]>([]);
  const { toast } = useToast();
  const navigate = useNavigate();
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!isLoading) redirectIfNotAdmin();
  }, [isLoading, isAdmin]);

  const fetchMetrics = async (from: Date = dateFrom, to: Date = dateTo) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const { data, error } = await supabase.functions.invoke('admin-engagement-metrics', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          dateFrom: format(from, 'yyyy-MM-dd'),
          dateTo: format(to, 'yyyy-MM-dd'),
        },
      });

      if (error) throw error;
      if (requestId === requestIdRef.current) {
        setMetrics(data);
      }
    } catch (err: unknown) {
      if (requestId === requestIdRef.current) {
        console.error('Error fetching metrics:', err);
        toast({
          title: 'Erro ao carregar métricas',
          description: err instanceof Error ? err.message : 'Erro desconhecido',
          variant: 'destructive',
        });
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (isAdmin) fetchMetrics();
  }, [isAdmin, dateFrom, dateTo]);

  const fetchRecoverySessions = async () => {
    try {
      const { data: abandoned, error } = await supabase
        .from('checkout_sessions')
        .select('id, name, phone, email, plan, created_at, status, recovery_sent, recovery_sent_at, recovery_last_error, recovery_attempts_count')
        .eq('recovery_sent', true)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      // Check which emails/phones later completed a checkout
      const emails = (abandoned || []).filter(s => s.email).map(s => s.email!);
      const phones = (abandoned || []).map(s => s.phone);
      const { data: completedByEmail } = emails.length > 0
        ? await supabase.from('checkout_sessions').select('email').eq('status', 'completed').in('email', emails)
        : { data: [] };
      const { data: completedByPhone } = await supabase
        .from('checkout_sessions').select('phone').eq('status', 'completed').in('phone', phones);

      const completedEmails = new Set((completedByEmail || []).map(c => c.email?.toLowerCase()));
      const completedPhones = new Set((completedByPhone || []).map(c => c.phone));

      // Fetch latest attempt status for each session
      const sessionIds = (abandoned || []).map(s => s.id);
      const { data: attempts } = await supabase
        .from('checkout_recovery_attempts')
        .select('checkout_session_id, status')
        .in('checkout_session_id', sessionIds)
        .order('created_at', { ascending: false });

      const attemptMap = new Map<string, string>();
      if (attempts) {
        for (const a of attempts) {
          if (!attemptMap.has(a.checkout_session_id)) {
            attemptMap.set(a.checkout_session_id, a.status);
          }
        }
      }

      // Deduplicate by email (primary) or phone (fallback)
      const byKey = new Map<string, typeof abandoned[number]>();
      for (const s of (abandoned || [])) {
        const key = s.email?.toLowerCase() || s.phone;
        const existing = byKey.get(key);
        if (!existing || new Date(s.created_at) > new Date(existing.created_at)) {
          byKey.set(key, s);
        }
      }
      const uniqueSessions = Array.from(byKey.values());

      setRecoverySessions(uniqueSessions.map(s => ({
        ...s,
        converted: (s.email && completedEmails.has(s.email.toLowerCase())) || completedPhones.has(s.phone),
        attempt_status: attemptMap.get(s.id) || null,
      })));
    } catch (err) {
      console.error('Error fetching recovery sessions:', err);
    }
  };

  const fetchDunningAttempts = async () => {
    try {
      const { data, error } = await supabase
        .from('dunning_attempts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setDunningAttempts((data || []) as unknown as DunningAttempt[]);
    } catch (err) {
      console.error('Error fetching dunning attempts:', err);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchRecoverySessions();
      fetchDunningAttempts();
    }
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

  const handleSendEmailNotification = async () => {
    if (!confirm('Enviar email de aviso de manutenção para todos os usuários ativos/trial com email cadastrado?')) return;
    setSendingEmail(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const { data, error } = await supabase.functions.invoke('notify-users-email', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error) throw error;
      toast({
        title: 'Emails enviados!',
        description: `${data.sent} enviados, ${data.failed} falhas (de ${data.total} total).`,
      });
    } catch (err: unknown) {
      toast({
        title: 'Erro no envio',
        description: err instanceof Error ? err.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setSendingEmail(false);
    }
  };

  if (isLoading || !isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  const periodLabel = `${format(dateFrom, 'dd/MM')} – ${format(dateTo, 'dd/MM')}`;

  const engagementCards = metrics ? [
    { title: 'Usuários Ativos no Período', value: metrics.activeUsers, icon: Users, subtitle: `${metrics.activeUsersBase} ativos na base` },
    { title: 'Msgs do Usuário no Período', value: metrics.userMessagesInPeriod, icon: MessageSquare, subtitle: `${metrics.totalMessagesInPeriod} total (user+assistant)` },
    { title: 'Sessões Completadas', value: metrics.weeklySessionsCount, icon: BarChart3, subtitle: `finalizadas no período (${periodLabel})` },
    { title: 'Tempo Médio de Sessão', value: `${metrics.avgSessionMinutes} min`, icon: Clock, subtitle: 'sessões completadas no período' },
    { title: 'Mensagens por Sessão', value: metrics.messagesPerSession, icon: MessageSquare, subtitle: 'média do usuário por sessão' },
    { title: 'Média Msgs/Dia por Usuário', value: metrics.avgDailyMessagesPerUser, icon: TrendingUp, subtitle: periodLabel },
    { title: 'Taxa de Retorno', value: `${metrics.returnRate}%`, icon: TrendingUp, subtitle: `${metrics.uniqueRecentUsers} de ${metrics.activeUsersBase} ativos da base` },
  ] : [];

  const trialCards = metrics ? [
    { title: 'Assinantes Ativos', value: metrics.activeSubscribers, icon: Users, subtitle: 'pagando agora (status = active)' },
    { title: 'Trials Ativos (< 7d)', value: metrics.activeTrials, icon: UserPlus, subtitle: 'trial iniciado há menos de 7 dias' },
    { title: 'Trials Expirados (aguardando)', value: metrics.expiredTrialsAwaitingPayment, icon: Clock, subtitle: 'trial > 7d, sem falha de pagamento' },
    { title: '⚠️ Falha de Pagamento', value: metrics.paymentFailedCount, icon: XCircle, subtitle: 'trial expirado + pagamento falhou' },
    { title: 'Trials no Período (total)', value: metrics.trialsInPeriod, icon: UserPlus, subtitle: `com e sem cartão — ${periodLabel}` },
    { title: 'Trials com Cartão (período)', value: metrics.trialsWithCardInPeriod, icon: UserPlus, subtitle: `checkout iniciado — ${periodLabel}` },
    { title: 'Convertidos no Período', value: metrics.convertedCount, icon: ArrowRightLeft, subtitle: 'trial → ativo (com cartão)' },
    { title: 'Taxa de Conversão', value: `${metrics.conversionRate}%`, icon: Percent, subtitle: `${metrics.convertedCount} de ${metrics.trialsWithCardInPeriod} com cartão` },
    { title: 'Tempo Médio até Conversão', value: `${metrics.avgDaysToConversion} dias`, icon: Timer, subtitle: 'trial → ativação (com cartão)' },
    { title: 'Msgs Trial (Convertidos)', value: metrics.avgMsgsConverted, icon: MessageSquare, subtitle: 'média durante trial' },
    { title: 'Msgs Trial (Não Convertidos)', value: metrics.avgMsgsNonConverted, icon: MessageSquare, subtitle: 'média durante trial' },
    { title: '✅ Taxa Trial→Pago', value: `${metrics.trialToPaidRate}%`, icon: CreditCard, subtitle: `${metrics.trialsToPaidSuccess} de ${metrics.trialsCompletedWeek} cobrados` },
    { title: 'Trials Pagos +7d', value: metrics.trialsCompletedWeek, icon: Clock, subtitle: 'pagaram trial e completaram semana' },
    { title: 'Cobrados (1ª mensalidade)', value: metrics.trialsToPaidSuccess, icon: CheckCircle2, subtitle: 'cobrança mensal com sucesso' },
    { title: 'Cancelados', value: metrics.canceledUsers, icon: XCircle, subtitle: 'status = canceled (all-time)' },
    { title: 'Cancelando', value: metrics.cancelingUsers, icon: Clock, subtitle: 'aguardando fim do período' },
  ] : [];

  const SkeletonCards = () => (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {[...Array(8)].map((_, i) => (
        <Card key={i} className="animate-pulse">
          <CardHeader className="p-3 pb-1"><div className="h-3 bg-muted rounded w-24" /></CardHeader>
          <CardContent className="p-3 pt-0"><div className="h-6 bg-muted rounded w-16" /></CardContent>
        </Card>
      ))}
    </div>
  );

  const MetricCards = ({ cards }: { cards: typeof engagementCards }) => (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">{card.title}</CardTitle>
            <card.icon className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold text-foreground">{card.value}</div>
            <p className="text-[11px] text-muted-foreground mt-0.5">{card.subtitle}</p>
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
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/admin/configuracoes')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold text-foreground">Métricas de Engajamento</h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1">
              {[
                { label: '7d', days: 7 },
                { label: '14d', days: 14 },
                { label: '30d', days: 30 },
                { label: '90d', days: 90 },
              ].map(({ label, days }) => (
                <Button
                  key={label}
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={() => { setDateFrom(subDays(new Date(), days)); setDateTo(new Date()); }}
                >
                  {label}
                </Button>
              ))}
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("h-8 text-xs justify-start", !dateFrom && "text-muted-foreground")}>
                  <CalendarIcon className="h-3 w-3 mr-1" />
                  {format(dateFrom, 'dd/MM/yy')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar mode="single" selected={dateFrom} onSelect={(d) => d && setDateFrom(d)} locale={ptBR} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
            <span className="text-xs text-muted-foreground">até</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("h-8 text-xs justify-start", !dateTo && "text-muted-foreground")}>
                  <CalendarIcon className="h-3 w-3 mr-1" />
                  {format(dateTo, 'dd/MM/yy')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar mode="single" selected={dateTo} onSelect={(d) => d && setDateTo(d)} locale={ptBR} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
            <Button variant="outline" size="sm" onClick={() => fetchMetrics()} disabled={loading} className="h-8">
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
            <Button variant="outline" size="sm" onClick={handleSendEmailNotification} disabled={sendingEmail} className="h-8 border-primary/30 text-primary hover:bg-primary/10">
              <Mail className={`h-4 w-4 mr-1 ${sendingEmail ? 'animate-pulse' : ''}`} />
              {sendingEmail ? 'Enviando...' : 'Aviso por Email'}
            </Button>
          </div>
        </div>

        <Tabs defaultValue="engagement" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="engagement">Engajamento</TabsTrigger>
            <TabsTrigger value="trial">Trial & Conversão</TabsTrigger>
            <TabsTrigger value="cancellations">Cancelamentos</TabsTrigger>
          </TabsList>

          <TabsContent value="engagement" className="mt-3 space-y-4">
            {loading && !metrics ? <SkeletonCards /> : (
              <>
                <MetricCards cards={engagementCards} />

                {/* Cost Section */}
                {metrics && metrics.totalCostUSD !== undefined && (
                  <div className="space-y-3">
                    <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Custo de IA no Período
                    </h2>
                    <div className="grid grid-cols-3 gap-3">
                      <Card>
                        <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
                          <CardTitle className="text-xs font-medium text-muted-foreground">Custo Total</CardTitle>
                          <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                        </CardHeader>
                        <CardContent className="p-3 pt-0">
                          <div className="text-xl font-bold text-foreground">${(metrics.totalCostUSD ?? 0).toFixed(2)}</div>
                          <p className="text-[11px] text-muted-foreground">{periodLabel}</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
                          <CardTitle className="text-xs font-medium text-muted-foreground">Custo/Usuário</CardTitle>
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        </CardHeader>
                        <CardContent className="p-3 pt-0">
                          <div className="text-xl font-bold text-foreground">${(metrics.avgCostPerActiveUser ?? 0).toFixed(2)}</div>
                          <p className="text-[11px] text-muted-foreground">{metrics.activeUsers} ativos</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
                          <CardTitle className="text-xs font-medium text-muted-foreground">Cache Savings</CardTitle>
                          <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                        </CardHeader>
                        <CardContent className="p-3 pt-0">
                          <div className="text-xl font-bold text-green-600">${(metrics.totalCacheSavings ?? 0).toFixed(2)}</div>
                          <p className="text-[11px] text-muted-foreground">vs. sem cache</p>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Cost breakdown inline table */}
                    {metrics.costBreakdownByModel && metrics.costBreakdownByModel.length > 0 && (
                      <div className="border border-border rounded-md overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-[11px] py-1.5 px-2">Modelo</TableHead>
                              <TableHead className="text-[11px] py-1.5 px-2 text-right">Calls</TableHead>
                              <TableHead className="text-[11px] py-1.5 px-2 text-right">Cache</TableHead>
                              <TableHead className="text-[11px] py-1.5 px-2 text-right">Custo</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {metrics.costBreakdownByModel.map((m) => (
                              <TableRow key={m.model}>
                                <TableCell className="font-mono text-[11px] py-1 px-2">{m.model}</TableCell>
                                <TableCell className="text-[11px] py-1 px-2 text-right">{m.calls}</TableCell>
                                <TableCell className="text-[11px] py-1 px-2 text-right text-green-600">{(m.cacheSavings ?? 0) > 0 ? `-$${(m.cacheSavings ?? 0).toFixed(2)}` : '—'}</TableCell>
                                <TableCell className="text-[11px] py-1 px-2 text-right font-semibold">${(m.cost ?? 0).toFixed(2)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="trial" className="mt-3 space-y-4">
            {loading && !metrics ? <SkeletonCards /> : (
              <>
                {/* BILLING METRICS */}
                {metrics && (
                  <div className="space-y-2">
                    <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      Cobranças no Período ({periodLabel})
                    </h2>
                    <div className="grid grid-cols-3 gap-3">
                      <Card>
                        <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
                          <CardTitle className="text-xs font-medium text-muted-foreground">Cobrados</CardTitle>
                          <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                        </CardHeader>
                        <CardContent className="p-3 pt-0">
                          <div className="text-xl font-bold text-foreground">{metrics.billingTotalInPeriod}</div>
                          <p className="text-[11px] text-muted-foreground">tentativas</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
                          <CardTitle className="text-xs font-medium text-muted-foreground">Sucesso</CardTitle>
                          <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </CardHeader>
                        <CardContent className="p-3 pt-0">
                          <div className="text-xl font-bold text-green-600">{metrics.billingSuccessInPeriod}</div>
                          <p className="text-[11px] text-muted-foreground">confirmados</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
                          <CardTitle className="text-xs font-medium text-muted-foreground">Taxa</CardTitle>
                          <Percent className="h-3.5 w-3.5 text-muted-foreground" />
                        </CardHeader>
                        <CardContent className="p-3 pt-0">
                          <div className="text-xl font-bold text-foreground">{metrics.billingSuccessRate}%</div>
                          <p className="text-[11px] text-muted-foreground">{metrics.billingSuccessInPeriod}/{metrics.billingTotalInPeriod}</p>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                )}

                {/* CHECKOUT FUNNEL */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <ShoppingCart className="h-4 w-4" />
                      Funil de Checkout (período)
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {periodLabel} — All-time: {metrics?.checkoutCreatedAllTime ?? 0} criados, {metrics?.checkoutCompletedAllTime ?? 0} finalizados
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {metrics && (
                      <>
                        <FunnelStep label="Clicaram para Pagar (sessão criada)" value={metrics.checkoutCreatedInPeriod} total={metrics.checkoutCreatedInPeriod} color="bg-blue-500" />
                        <FunnelStep label="Finalizaram Pagamento" value={metrics.checkoutCompletedInPeriod} total={metrics.checkoutCreatedInPeriod} color="bg-green-500" />
                        <div className="flex justify-between text-sm pt-2 border-t border-border">
                          <span className="text-muted-foreground">Desistiram no pagamento</span>
                          <span className="font-semibold text-destructive">{metrics.checkoutDropoffInPeriod} <span className="text-muted-foreground font-normal">({metrics.checkoutCreatedInPeriod > 0 ? Math.round(metrics.checkoutDropoffInPeriod / metrics.checkoutCreatedInPeriod * 100) : 0}%)</span></span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Taxa de finalização</span>
                          <span className="font-semibold text-foreground">{metrics.checkoutCompletionRate}%</span>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* RECOVERY TABLE */}
                {recoverySessions.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <RotateCcw className="h-4 w-4" />
                        Recuperação de Checkout Abandonado
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {recoverySessions.length} tentativas — {recoverySessions.filter(s => s.attempt_status === 'api_accepted').length} aceitas pela API — {recoverySessions.filter(s => s.converted).length} converteram
                      </p>
                    </CardHeader>
                    <CardContent>
                      <Table>
                         <TableHeader>
                          <TableRow>
                            <TableHead>Nome</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Plano</TableHead>
                            <TableHead>Abandono</TableHead>
                            <TableHead>Envio</TableHead>
                            <TableHead>Resultado</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {recoverySessions.map((s) => {
                            const planNames: Record<string, string> = { essencial: 'Essencial', direcao: 'Direção', transformacao: 'Transformação' };
                            const maskedEmail = s.email ? `${s.email.substring(0, 3)}***@${s.email.split('@')[1] || ''}` : '—';
                            const attemptStatus = s.attempt_status;
                            const sendBadge = attemptStatus === 'api_accepted'
                              ? <Badge className="bg-emerald-600 text-white text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" />Enviado</Badge>
                              : attemptStatus === 'failed' || attemptStatus === 'error'
                              ? <Badge variant="destructive" className="text-[10px]"><AlertCircle className="h-3 w-3 mr-1" />{s.recovery_last_error?.substring(0, 30) || 'Falhou'}</Badge>
                              : attemptStatus === 'skipped' || attemptStatus === 'skipped_active_customer'
                              ? <Badge variant="outline" className="text-[10px]">{attemptStatus === 'skipped_active_customer' ? 'Cliente ativo' : 'Sem email'}</Badge>
                              : <Badge variant="secondary" className="text-[10px]">Legado</Badge>;
                            return (
                              <TableRow key={s.id}>
                                <TableCell className="font-medium">{s.name || '—'}</TableCell>
                                <TableCell className="text-xs">{maskedEmail}</TableCell>
                                <TableCell>{planNames[s.plan || ''] || s.plan || '—'}</TableCell>
                                <TableCell className="text-xs">{format(new Date(s.created_at), 'dd/MM HH:mm')}</TableCell>
                                <TableCell>{sendBadge}</TableCell>
                                <TableCell>
                                  {s.converted ? (
                                    <Badge className="bg-green-600 text-white"><CheckCircle2 className="h-3 w-3 mr-1" />Converteu</Badge>
                                  ) : (
                                    <Badge variant="secondary"><AlertCircle className="h-3 w-3 mr-1" />Não voltou</Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}

                {/* DUNNING ATTEMPTS TABLE */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      Tentativas de Dunning (Pagamento Falhou)
                    </CardTitle>
                     <p className="text-xs text-muted-foreground">
                       {dunningAttempts.length} tentativas registradas — {dunningAttempts.filter(d => d.whatsapp_sent).length} emails enviados, {dunningAttempts.filter(d => !d.profile_found).length} sem perfil
                     </p>
                   </CardHeader>
                   <CardContent>
                     {dunningAttempts.length === 0 ? (
                       <p className="text-sm text-muted-foreground text-center py-4">Nenhuma tentativa de dunning registrada ainda.</p>
                     ) : (
                       <Table>
                         <TableHeader>
                           <TableRow>
                             <TableHead>Data</TableHead>
                             <TableHead>Telefone</TableHead>
                             <TableHead>Perfil</TableHead>
                             <TableHead>Link</TableHead>
                             <TableHead>Email</TableHead>
                             <TableHead>Erro</TableHead>
                           </TableRow>
                         </TableHeader>
                         <TableBody>
                           {dunningAttempts.map((d) => {
                             const maskedPhone = d.phone_resolved ? `${d.phone_resolved.substring(0, 6)}***` : d.phone_raw ? `${d.phone_raw.substring(0, 6)}***` : '—';
                             return (
                               <TableRow key={d.id}>
                                 <TableCell className="text-xs">{format(new Date(d.created_at), 'dd/MM HH:mm')}</TableCell>
                                 <TableCell className="font-mono text-xs">{maskedPhone}</TableCell>
                                 <TableCell>
                                   {d.profile_found ? (
                                     <Badge className="bg-green-600 text-white text-xs">Sim</Badge>
                                   ) : (
                                     <Badge variant="destructive" className="text-xs">Não</Badge>
                                   )}
                                 </TableCell>
                                 <TableCell>
                                   {d.link_generated ? (
                                     <Badge className="bg-green-600 text-white text-xs">✓</Badge>
                                   ) : (
                                     <Badge variant="secondary" className="text-xs">—</Badge>
                                   )}
                                 </TableCell>
                                 <TableCell>
                                   {d.whatsapp_sent ? (
                                     <Badge className="bg-green-600 text-white text-xs"><Mail className="h-3 w-3 mr-1" />Enviado</Badge>
                                   ) : (
                                     <Badge variant="secondary" className="text-xs">Não</Badge>
                                   )}
                                </TableCell>
                                <TableCell className="text-xs max-w-[200px] truncate" title={d.error_message || ''}>
                                  {d.error_stage ? (
                                    <span className="text-destructive">{d.error_stage}</span>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <ArrowDown className="h-4 w-4" />
                      Funil de Conversão (período — somente com cartão)
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Período selecionado: {periodLabel}. Contexto all-time: {metrics?.totalTrialsAllTime ?? 0} trials, {metrics?.totalTrialsWithCardAllTime ?? 0} com cartão.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {metrics && (
                      <>
                        <FunnelStep label="Iniciaram Trial (com cartão)" value={metrics.trialsWithCardInPeriod} total={metrics.trialsWithCardInPeriod} color="bg-blue-500" />
                        <FunnelStep label="Responderam (1+ mensagem)" value={metrics.trialRespondedCount} total={metrics.trialsWithCardInPeriod} color="bg-cyan-500" />
                        <FunnelStep label="Converteram (assinaram)" value={metrics.convertedCount} total={metrics.trialsWithCardInPeriod} color="bg-green-500" />
                      </>
                    )}
                  </CardContent>
                </Card>

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

                {/* Distribuição por Plano */}
                {metrics?.trialsByPlan && metrics.trialsByPlan.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base font-semibold">Distribuição por Plano (com cartão, período)</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {metrics.trialsByPlan.map((item) => {
                        const planNames: Record<string, string> = { essencial: 'Essencial', direcao: 'Direção', transformacao: 'Transformação', sem_plano: 'Sem plano' };
                        const total = metrics.trialsByPlan!.reduce((s, i) => s + i.count, 0);
                        const pct = total > 0 ? Math.round(item.count / total * 100) : 0;
                        return (
                          <div key={item.plan} className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">{planNames[item.plan] || item.plan}</span>
                            <span className="font-semibold text-foreground">{item.count} <span className="text-muted-foreground font-normal">({pct}%)</span></span>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                )}

                {/* Cards detalhados */}
                <MetricCards cards={trialCards} />
              </>
            )}
          </TabsContent>

          <TabsContent value="cancellations" className="mt-3 space-y-4">
            {loading && !metrics ? <SkeletonCards /> : metrics && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
                      <CardTitle className="text-xs font-medium text-muted-foreground">Cancelamentos</CardTitle>
                      <UserMinus className="h-3.5 w-3.5 text-muted-foreground" />
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <div className="text-xl font-bold text-foreground">{metrics.canceledInPeriod}</div>
                      <p className="text-[11px] text-muted-foreground">{periodLabel}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
                      <CardTitle className="text-xs font-medium text-muted-foreground">Pausados</CardTitle>
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <div className="text-xl font-bold text-foreground">{metrics.pausedInPeriod}</div>
                      <p className="text-[11px] text-muted-foreground">{periodLabel}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
                      <CardTitle className="text-xs font-medium text-muted-foreground">Churn Rate</CardTitle>
                      <Percent className="h-3.5 w-3.5 text-muted-foreground" />
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <div className="text-xl font-bold text-foreground">{metrics.churnRate}%</div>
                      <p className="text-[11px] text-muted-foreground">cancelados / ativos</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Cancellation reasons */}
                {metrics.cancellationReasons && metrics.cancellationReasons.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base font-semibold">Motivos de Cancelamento</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {metrics.cancellationReasons.map((item) => {
                        const reasonNames: Record<string, string> = {
                          expensive: 'Está caro pra mim',
                          not_useful: 'Não achei útil',
                          prefer_human: 'Prefiro terapia humana',
                          no_time: 'Não tenho tempo',
                          other: 'Outro motivo',
                          unknown: 'Não informado',
                        };
                        const total = metrics.cancellationReasons.reduce((s, i) => s + i.count, 0);
                        const pct = total > 0 ? Math.round(item.count / total * 100) : 0;
                        return (
                          <div key={item.reason} className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">{reasonNames[item.reason] || item.reason}</span>
                            <span className="font-semibold text-foreground">{item.count} <span className="text-muted-foreground font-normal">({pct}%)</span></span>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
