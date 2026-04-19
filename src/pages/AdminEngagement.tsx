import { useEffect, useRef, useState } from 'react';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Users, MessageSquare, Clock, BarChart3, RefreshCw, TrendingUp, UserPlus, Percent, Timer, XCircle, ArrowRightLeft, ArrowDown, Send, CalendarIcon, DollarSign, UserMinus, ShoppingCart, RotateCcw, CheckCircle2, AlertCircle, CreditCard, Mail, ChevronDown } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
  totalCostBRL: number;
  avgDailyCostUSD: number;
  avgDailyCostBRL: number;
  dailyCostAlertBRL: number;
  costAlertActive: boolean;
  cacheHitRate: number;
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
  // Weekly Plans (Stripe)
  totalWeeklyPlans: number;
  weeklyPlansInPeriod: number;
  trialsCompletedWeek: number;
  trialsToPaidSuccess: number;
  weeklyPlansExpired: number;
  trialToPaidRate: number;
  // Cancellation (voluntary + involuntary)
  canceledInPeriod: number;
  voluntaryChurnInPeriod: number;
  involuntaryChurnInPeriod: number;
  pausedInPeriod: number;
  churnRate: number;
  voluntaryChurnRate: number;
  involuntaryChurnRate: number;
  churnRateLegacy: number;
  activeAtPeriodStart: number;
  paymentAtRiskCount: number;
  pastDueRecentCount?: number;
  pastDueCriticalCount?: number;
  involuntaryChurnLive?: number;
  voluntaryChurnLive?: number;
  totalChurnFromStripe?: number;
  stripeChurnReasons?: Record<string, number>;
  recoveryRate: number;
  totalPaymentFailedAllTime: number;
  recoveredPayments: number;
  cancellationReasons: { reason: string; action_taken: string; count: number }[];
  internalCancellationReasons30d?: Record<string, number>;
  // 💰 Revenue & MRR (Stripe-sourced)
  mrrCommittedBRL: number;
  mrrWeeklyEquivBRL: number;
  mrrTotalBRL: number;
  mrrAtRiskBRL: number;
  mrrAtRiskRecentBRL?: number;
  mrrAtRiskCriticalBRL?: number;
  mrrAtRiskMonthlyBRL?: number;
  mrrAtRiskWeeklyBRL?: number;
  activeSubscriptionsCount: number;
  monthlyActiveSubscriptionsCount?: number;
  weeklyActiveSubscriptionsCount?: number;
  pastDueSubscriptionsCount: number;
  mrrBreakdown: { plan: string; users: number; committedBRL: number; weeklyEquivBRL: number; totalBRL: number }[];
  // 🎯 Activation
  activationRate: number;
  activatedUsersCount: number;
  payingUsersCount: number;
  silentPayersCount: number;
  // 📈 Mature trial conversion
  matureTrialsCount: number;
  matureConvertedCount: number;
  matureConversionRate: number;
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
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [dunningOpen, setDunningOpen] = useState(false);
  const [showAllRecovery, setShowAllRecovery] = useState(false);
  const [showAllDunning, setShowAllDunning] = useState(false);
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
    { title: 'Total Planos Semanais', value: metrics.totalWeeklyPlans, icon: ShoppingCart, subtitle: 'pessoas únicas (fonte: Stripe)' },
    { title: 'Semanais Ativos (< 7d)', value: Math.max(0, metrics.totalWeeklyPlans - metrics.trialsCompletedWeek), icon: UserPlus, subtitle: 'cobrança há menos de 7 dias' },
    { title: 'Semanais no Período', value: metrics.weeklyPlansInPeriod, icon: UserPlus, subtitle: `cobranças semanais — ${periodLabel}` },
    { title: '⚠️ Falha de Pagamento', value: metrics.paymentFailedCount, icon: XCircle, subtitle: 'pagamento falhou' },
    { title: '✅ Taxa Semanal→Mensal', value: `${metrics.trialToPaidRate}%`, icon: CreditCard, subtitle: `${metrics.trialsToPaidSuccess} de ${metrics.weeklyPlansExpired || 0} expirados` },
    { title: 'Semanais +7d', value: metrics.trialsCompletedWeek, icon: Clock, subtitle: 'completaram a semana' },
    { title: 'Semanais Expirados', value: metrics.weeklyPlansExpired || 0, icon: Clock, subtitle: 'tentativa de cobrança mensal realizada' },
    { title: 'Convertidos (1ª mensalidade)', value: metrics.trialsToPaidSuccess, icon: CheckCircle2, subtitle: '1ª mensalidade paga com sucesso' },
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

        <Tabs defaultValue="revenue" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="revenue">💰 Receita & Saúde</TabsTrigger>
            <TabsTrigger value="engagement">Engajamento</TabsTrigger>
            <TabsTrigger value="trial">Semanais & Conversão</TabsTrigger>
            <TabsTrigger value="cancellations">Cancelamentos</TabsTrigger>
          </TabsList>

          <TabsContent value="revenue" className="mt-3 space-y-4">
            {loading && !metrics ? <SkeletonCards /> : metrics && (
              <>
                {/* Hero MRR Card */}
                <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-accent/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      MRR Total (Stripe — fonte da verdade)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-4xl font-bold text-foreground">R$ {metrics.mrrTotalBRL.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      {metrics.activeSubscriptionsCount} assinaturas ativas
                      {(metrics.monthlyActiveSubscriptionsCount !== undefined || metrics.weeklyActiveSubscriptionsCount !== undefined) && (
                        <> ({metrics.monthlyActiveSubscriptionsCount ?? 0} mensais/anuais + {metrics.weeklyActiveSubscriptionsCount ?? 0} semanais)</>
                      )}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3 text-xs">
                      <div>
                        <span className="text-muted-foreground">Comprometido (mensal/anual): </span>
                        <div className="font-semibold text-foreground">R$ {metrics.mrrCommittedBRL.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                        <div className="text-[10px] text-muted-foreground">{metrics.monthlyActiveSubscriptionsCount ?? metrics.activeSubscriptionsCount} assinaturas mensais/anuais</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Semanal anualizado: </span>
                        <div className="font-semibold text-foreground">R$ {metrics.mrrWeeklyEquivBRL.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                        <div className="text-[10px] text-muted-foreground">{metrics.weeklyActiveSubscriptionsCount ?? 0} semanais × 4.33 (Stripe trialing = semanal pago)</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">⚠️ Em risco (past_due no Stripe): </span>
                        <div className={`font-semibold ${metrics.mrrAtRiskBRL > 0 ? 'text-destructive' : 'text-foreground'}`}>R$ {metrics.mrrAtRiskBRL.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {metrics.pastDueSubscriptionsCount} cobranças (Stripe tenta recuperar por ~30d)
                          {(metrics.mrrAtRiskMonthlyBRL !== undefined && metrics.mrrAtRiskWeeklyBRL !== undefined && (metrics.mrrAtRiskMonthlyBRL > 0 || metrics.mrrAtRiskWeeklyBRL > 0)) && (
                            <> · R$ {metrics.mrrAtRiskMonthlyBRL.toFixed(0)} mensais + R$ {metrics.mrrAtRiskWeeklyBRL.toFixed(0)} semanais</>
                          )}
                          {((metrics.pastDueRecentCount ?? 0) > 0 || (metrics.pastDueCriticalCount ?? 0) > 0) && (
                            <div className="mt-1">
                              🟡 ≤7d: {metrics.pastDueRecentCount ?? 0} (R$ {(metrics.mrrAtRiskRecentBRL ?? 0).toFixed(0)})
                              {' · '}
                              🟠 &gt;7d: {metrics.pastDueCriticalCount ?? 0} (R$ {(metrics.mrrAtRiskCriticalBRL ?? 0).toFixed(0)})
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-3">
                      💡 Dados em tempo real do Stripe. Inclui status <code>active</code>, <code>trialing</code> (semanal pago) e <code>past_due</code>. Valores reais (<code>unit_amount</code>) por assinatura.
                    </p>
                  </CardContent>
                </Card>

                {/* Health KPIs grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
                      <CardTitle className="text-xs font-medium text-muted-foreground">🎯 Activation Rate</CardTitle>
                      <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <div className={`text-xl font-bold ${metrics.activationRate >= 70 ? 'text-green-600' : metrics.activationRate >= 50 ? 'text-yellow-600' : 'text-destructive'}`}>
                        {metrics.activationRate}%
                      </div>
                      <p className="text-[11px] text-muted-foreground">{metrics.activatedUsersCount}/{metrics.payingUsersCount} falaram em ≤3d</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
                      <CardTitle className="text-xs font-medium text-muted-foreground">🔇 Pagantes Silenciosos</CardTitle>
                      <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <div className={`text-xl font-bold ${metrics.silentPayersCount > 0 ? 'text-destructive' : 'text-foreground'}`}>
                        {metrics.silentPayersCount}
                      </div>
                      <p className="text-[11px] text-muted-foreground">pagaram, nunca falaram</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
                      <CardTitle className="text-xs font-medium text-muted-foreground">📈 Conversão Madura</CardTitle>
                      <ArrowRightLeft className="h-3.5 w-3.5 text-muted-foreground" />
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <div className={`text-xl font-bold ${metrics.matureConversionRate >= 25 ? 'text-green-600' : 'text-foreground'}`}>
                        {metrics.matureConversionRate}%
                      </div>
                      <p className="text-[11px] text-muted-foreground">{metrics.matureConvertedCount}/{metrics.matureTrialsCount} trials &gt;7d</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
                      <CardTitle className="text-xs font-medium text-muted-foreground">💚 Recovery Rate</CardTitle>
                      <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <div className={`text-xl font-bold ${metrics.recoveryRate >= 30 ? 'text-green-600' : metrics.recoveryRate >= 15 ? 'text-yellow-600' : 'text-destructive'}`}>
                        {metrics.recoveryRate}%
                      </div>
                      <p className="text-[11px] text-muted-foreground">{metrics.recoveredPayments}/{metrics.totalPaymentFailedAllTime} cartões recuperados</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Churn breakdown card */}
                <Card className="border-destructive/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <UserMinus className="h-4 w-4" />
                      Churn Total no Período (Voluntário + Involuntário)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-baseline gap-3">
                      <div className={`text-3xl font-bold ${metrics.churnRate <= 5 ? 'text-green-600' : metrics.churnRate <= 10 ? 'text-yellow-600' : 'text-destructive'}`}>
                        {metrics.churnRate}%
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {metrics.canceledInPeriod} usuários (banco) / {metrics.activeAtPeriodStart} ativos no início
                      </div>
                    </div>
                    {(metrics.totalChurnFromStripe ?? 0) > 0 && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        🔎 <strong>Stripe (30d real):</strong> {metrics.totalChurnFromStripe} cancelamentos · {metrics.voluntaryChurnLive ?? 0} voluntários + {metrics.involuntaryChurnLive ?? 0} involuntários
                      </div>
                    )}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-xs">
                      <div className="border rounded-md p-2.5 bg-muted/30">
                        <div className="text-muted-foreground mb-1">🟦 Voluntário (Stripe 30d)</div>
                        <div className="font-semibold text-foreground">{metrics.voluntaryChurnLive ?? metrics.voluntaryChurnInPeriod}</div>
                        <div className="text-[10px] text-muted-foreground mt-1">
                          inclui Portal Stripe · banco: {metrics.voluntaryChurnInPeriod}
                        </div>
                      </div>
                      <div className="border rounded-md p-2.5 bg-yellow-500/10 border-yellow-500/30">
                        <div className="text-muted-foreground mb-1">🟡 Em risco ≤7d (recuperável)</div>
                        <div className="font-semibold text-yellow-700 dark:text-yellow-500">{metrics.pastDueRecentCount ?? 0}</div>
                        <div className="text-[10px] text-muted-foreground mt-1">R$ {(metrics.mrrAtRiskRecentBRL ?? 0).toFixed(2)} · dunning recente</div>
                      </div>
                      <div className="border rounded-md p-2.5 bg-orange-500/10 border-orange-500/30">
                        <div className="text-muted-foreground mb-1">🟠 Em risco crítico &gt;7d</div>
                        <div className="font-semibold text-orange-700 dark:text-orange-500">{metrics.pastDueCriticalCount ?? 0}</div>
                        <div className="text-[10px] text-muted-foreground mt-1">R$ {(metrics.mrrAtRiskCriticalBRL ?? 0).toFixed(2)} · Stripe ainda tentando</div>
                      </div>
                      <div className="border rounded-md p-2.5 bg-destructive/10 border-destructive/30">
                        <div className="text-muted-foreground mb-1">🔴 Churn involuntário (Stripe 30d)</div>
                        <div className="font-semibold text-destructive">{metrics.involuntaryChurnLive ?? 0}</div>
                        <div className="text-[10px] text-muted-foreground mt-1">canceladas pelo Stripe por falha de pagamento</div>
                      </div>
                    </div>
                    {metrics.stripeChurnReasons && Object.keys(metrics.stripeChurnReasons).length > 0 && (
                      <div className="mt-3 p-2.5 border rounded-md bg-muted/20">
                        <div className="text-[11px] font-medium text-muted-foreground mb-1.5">Razões de cancelamento (Stripe, últimos 30d):</div>
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(metrics.stripeChurnReasons)
                            .sort(([, a], [, b]) => b - a)
                            .map(([reason, count]) => (
                              <span key={reason} className="text-[10px] px-2 py-0.5 rounded-full bg-background border">
                                <strong>{count}</strong> · {reason}
                              </span>
                            ))}
                        </div>
                      </div>
                    )}
                    {metrics.internalCancellationReasons30d && Object.keys(metrics.internalCancellationReasons30d).length > 0 && (
                      <div className="mt-2 p-2.5 border rounded-md bg-primary/5 border-primary/20">
                        <div className="text-[11px] font-medium text-muted-foreground mb-1.5">
                          🟦 Motivos detalhados (banco interno · fluxo /cancelar · últimos 30d):
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(metrics.internalCancellationReasons30d)
                            .sort(([, a], [, b]) => b - a)
                            .map(([reason, count]) => {
                              const labels: Record<string, string> = {
                                expensive: '💰 Está caro',
                                not_using: '😴 Não estou usando',
                                not_satisfied: '😞 Não gostei do serviço',
                                come_back_later: '👋 Vou voltar depois',
                                other: '❓ Outro motivo',
                                pause_requested: '⏸️ Pediu pausa',
                                unknown: '— Sem motivo',
                              };
                              return (
                                <span key={reason} className="text-[10px] px-2 py-0.5 rounded-full bg-background border">
                                  <strong>{count}</strong> · {labels[reason] || reason}
                                </span>
                              );
                            })}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1.5">
                          ℹ️ Captura quem cancelou pelo nosso fluxo (não inclui Portal Stripe)
                        </div>
                      </div>
                    )}
                    <p className="text-[11px] text-muted-foreground mt-3">
                      💡 <strong>Stripe é fonte da verdade</strong> e captura cancelamentos via Portal Stripe que não passam pelo nosso UI. Banco interno (cancellation_feedback) só registra cancelamentos feitos no app. Stripe Smart Retries tenta recuperar pagamentos por até ~4 semanas antes de cancelar.
                    </p>
                  </CardContent>
                </Card>

                {/* MRR breakdown by plan */}
                {metrics.mrrBreakdown.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base font-semibold">MRR por Plano</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Plano</TableHead>
                            <TableHead className="text-xs text-right">Assinaturas</TableHead>
                            <TableHead className="text-xs text-right">Mensal/Anual (R$)</TableHead>
                            <TableHead className="text-xs text-right">Semanal anualizado (R$)</TableHead>
                            <TableHead className="text-xs text-right">Total (R$)</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {metrics.mrrBreakdown.map((row) => {
                            const planNames: Record<string, string> = { essencial: 'Essencial', direcao: 'Direção', transformacao: 'Transformação' };
                            return (
                              <TableRow key={row.plan}>
                                <TableCell className="font-medium text-sm">{planNames[row.plan] || row.plan}</TableCell>
                                <TableCell className="text-sm text-right">{row.users}</TableCell>
                                <TableCell className="text-sm text-right">{row.committedBRL.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                                <TableCell className="text-sm text-right text-muted-foreground">{row.weeklyEquivBRL.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                                <TableCell className="text-sm text-right font-semibold">{row.totalBRL.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}

                {/* Methodology note */}
                <Card className="bg-muted/30">
                  <CardContent className="p-4 text-xs text-muted-foreground space-y-1.5">
                    <p><strong className="text-foreground">📚 Metodologia:</strong></p>
                    <p>• <strong>MRR Total:</strong> buscado em tempo real no Stripe. Soma assinaturas active (mensal/anual prorrateado) + semanal × 4.33.</p>
                    <p>• <strong>MRR em Risco:</strong> assinaturas em past_due (Stripe ainda tentando cobrar — pode recuperar).</p>
                    <p>• <strong>Churn Voluntário:</strong> usuário clicou em cancelar (via cancellation_feedback).</p>
                    <p>• <strong>Churn Involuntário:</strong> cartão recusado há 7+ dias E status virou canceled/trial_expired/inactive no período.</p>
                    <p>• <strong>Recovery Rate:</strong> % de usuários com cartão recusado que voltaram para status active (all-time).</p>
                    <p>• <strong>Activation Rate:</strong> % de pagantes que enviaram a 1ª mensagem em ≤3 dias do cadastro. Meta: &gt;70%.</p>
                    <p>• <strong>Conversão Madura:</strong> só conta trials com ≥7 dias de vida. Meta: &gt;25%.</p>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

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
                    {/* Daily cost alert */}
                    {metrics.costAlertActive && (
                      <div className="border border-destructive/50 bg-destructive/10 rounded-md px-3 py-2 text-xs text-destructive">
                        ⚠️ Custo diário médio (R${(metrics.avgDailyCostBRL ?? 0).toFixed(2)}) acima do limite de R${metrics.dailyCostAlertBRL ?? 30}/dia
                      </div>
                    )}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <Card>
                        <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
                          <CardTitle className="text-xs font-medium text-muted-foreground">Custo Total</CardTitle>
                          <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                        </CardHeader>
                        <CardContent className="p-3 pt-0">
                          <div className="text-xl font-bold text-foreground">R${(metrics.totalCostBRL ?? 0).toFixed(2)}</div>
                          <p className="text-[11px] text-muted-foreground">${(metrics.totalCostUSD ?? 0).toFixed(2)} • {periodLabel}</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
                          <CardTitle className="text-xs font-medium text-muted-foreground">Custo/Dia</CardTitle>
                          <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                        </CardHeader>
                        <CardContent className="p-3 pt-0">
                          <div className={`text-xl font-bold ${metrics.costAlertActive ? 'text-destructive' : 'text-foreground'}`}>R${(metrics.avgDailyCostBRL ?? 0).toFixed(2)}</div>
                          <p className="text-[11px] text-muted-foreground">limite: R${metrics.dailyCostAlertBRL ?? 30}/dia</p>
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
                          <CardTitle className="text-xs font-medium text-muted-foreground">Cache Hit Rate</CardTitle>
                          <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                        </CardHeader>
                        <CardContent className="p-3 pt-0">
                          <div className="text-xl font-bold text-green-600">{(metrics.cacheHitRate ?? 0).toFixed(1)}%</div>
                          <p className="text-[11px] text-muted-foreground">economia: ${(metrics.totalCacheSavings ?? 0).toFixed(2)}</p>
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
                {/* 1. Cards de métricas */}
                <MetricCards cards={trialCards} />

                {/* 2. Cobranças no Período */}
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

                {/* 3. Funil de Checkout */}
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

                {/* 4. Funil de Conversão */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <ArrowDown className="h-4 w-4" />
                      Funil de Conversão (período)
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Período selecionado: {periodLabel}. All-time: {metrics?.totalWeeklyPlans ?? 0} planos semanais (Stripe).
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {metrics && (
                      <>
                        <FunnelStep label="Pagaram Plano Semanal" value={metrics.trialsWithCardInPeriod} total={metrics.trialsWithCardInPeriod} color="bg-blue-500" />
                        <FunnelStep label="Responderam (1+ mensagem)" value={metrics.trialRespondedCount} total={metrics.trialsWithCardInPeriod} color="bg-cyan-500" />
                        <FunnelStep label="Converteram (assinaram mensal)" value={metrics.convertedCount} total={metrics.trialsWithCardInPeriod} color="bg-green-500" />
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* 5. Distribuição por Plano */}
                {metrics?.trialsByPlan && metrics.trialsByPlan.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base font-semibold">Distribuição por Plano (período)</CardTitle>
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

                {/* 6. Recuperação de Checkout (colapsável) */}
                {recoverySessions.length > 0 && (
                  <Collapsible open={recoveryOpen} onOpenChange={setRecoveryOpen}>
                    <Card>
                      <CollapsibleTrigger asChild>
                        <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base font-semibold flex items-center gap-2">
                              <RotateCcw className="h-4 w-4" />
                              Recuperação de Checkout Abandonado
                            </CardTitle>
                            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${recoveryOpen ? 'rotate-180' : ''}`} />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {recoverySessions.length} tentativas — {recoverySessions.filter(s => s.attempt_status === 'api_accepted').length} aceitas pela API — {recoverySessions.filter(s => s.converted).length} converteram
                          </p>
                        </CardHeader>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
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
                              {(showAllRecovery ? recoverySessions : recoverySessions.slice(0, 5)).map((s) => {
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
                          {recoverySessions.length > 5 && (
                            <Button variant="ghost" size="sm" className="w-full mt-2 text-xs" onClick={() => setShowAllRecovery(!showAllRecovery)}>
                              {showAllRecovery ? 'Mostrar menos' : `Ver todos (${recoverySessions.length})`}
                            </Button>
                          )}
                        </CardContent>
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>
                )}

                {/* 7. Tentativas de Dunning (colapsável) */}
                <Collapsible open={dunningOpen} onOpenChange={setDunningOpen}>
                  <Card>
                    <CollapsibleTrigger asChild>
                      <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base font-semibold flex items-center gap-2">
                            <CreditCard className="h-4 w-4" />
                            Tentativas de Dunning (Pagamento Falhou)
                          </CardTitle>
                          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${dunningOpen ? 'rotate-180' : ''}`} />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {dunningAttempts.length} tentativas registradas — {dunningAttempts.filter(d => d.whatsapp_sent).length} emails enviados, {dunningAttempts.filter(d => !d.profile_found).length} sem perfil
                        </p>
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent>
                        {dunningAttempts.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">Nenhuma tentativa de dunning registrada ainda.</p>
                        ) : (
                          <>
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
                                {(showAllDunning ? dunningAttempts : dunningAttempts.slice(0, 5)).map((d) => {
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
                            {dunningAttempts.length > 5 && (
                              <Button variant="ghost" size="sm" className="w-full mt-2 text-xs" onClick={() => setShowAllDunning(!showAllDunning)}>
                                {showAllDunning ? 'Mostrar menos' : `Ver todos (${dunningAttempts.length})`}
                              </Button>
                            )}
                          </>
                        )}
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>

                {/* 8. Botão Reativar */}
                <Card>
                  <CardContent className="flex items-center justify-between py-4">
                    <div>
                      <p className="font-medium text-foreground">Reativar Semanais Finalizados</p>
                      <p className="text-xs text-muted-foreground">Envia mensagem conversacional e reseta contador para continuar o fluxo</p>
                    </div>
                    <Button onClick={handleReactivationBlast} disabled={blasting} variant="outline" size="sm">
                      <Send className={`h-4 w-4 mr-2 ${blasting ? 'animate-pulse' : ''}`} />
                      {blasting ? 'Enviando...' : 'Disparar'}
                    </Button>
                  </CardContent>
                </Card>
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
                      <p className="text-[11px] text-muted-foreground">{metrics.canceledInPeriod}/{metrics.activeAtPeriodStart} (ativos no início)</p>
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5">Legado: {metrics.churnRateLegacy}%</p>
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
