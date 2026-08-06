import { useEffect, useRef, useState } from 'react';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Users, MessageSquare, Clock, BarChart3, RefreshCw, TrendingUp, UserPlus, Percent, Timer, XCircle, ArrowRightLeft, ArrowDown, Send, CalendarIcon, DollarSign, UserMinus, ShoppingCart, RotateCcw, CheckCircle2, AlertCircle, CreditCard, Mail, ChevronDown, MessageCircle, Heart } from 'lucide-react';
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
  _snapshot_computed_at?: string;
  _snapshot_window?: string;
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
  // Checkout funnel — totais (cartão + PIX)
  checkoutCreatedTotalInPeriod?: number;
  checkoutCompletedTotalInPeriod?: number;
  checkoutCreatedTotalAllTime?: number;
  checkoutCompletedTotalAllTime?: number;
  // PIX Automático (Bacen)
  pixAuto?: {
    createdInPeriod: number;
    activatedInPeriod: number;
    lostInPeriod: number;
    pendingNow: number;
    activeTotal: number;
    authorizationRate: number;
    autodebitFailures: { email?: string | null; plan?: string | null; alertedAt?: string | null; hasSubscription?: boolean }[];
  };
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
  cohortRetention?: {
    churn0_7: { total: number; canceled: number; pct: number };
    churn8_30: { total: number; canceled: number; pct: number };
    churn31_60: { total: number; canceled: number; pct: number };
    churn61_90: { total: number; canceled: number; pct: number };
  };
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
  // 🚀 Fase 2: derivadas de receita
  arrBRL?: number;
  arpuBRL?: number;
  mrrGrowthBRL?: number;
  mrrGrowthPct?: number;
  newMRRBRL?: number;
  churnedMRRBRL?: number;
  mrrAtPeriodStartBRL?: number;
  grossMarginBRL?: number;
  grossMarginPct?: number;
  totalCostMonthlyBRL?: number;
  periodDays?: number;
  avgDaysUntilChurn?: number;
  churnedSubsCount90d?: number;
  // 🎯 Activation
  activationRate: number;
  activatedUsersCount: number;
  payingUsersCount: number;
  silentPayersCount: number;
  // 📈 Mature trial conversion
  matureTrialsCount: number;
  matureConvertedCount: number;
  matureConversionRate: number;
  // 🛡️ Higiene de interpretação
  correctionsTotalInPeriod?: number;
  correctionsUsersInPeriod?: number;
  correctionsPerUserInPeriod?: number;
  correctionsWeekly?: { week: string; total: number; users: number; per_user: number }[];
  // 🧭 Fechamento de sessão
  closureTotal?: number;
  closureDialogada?: number;
  closureUnilateral?: number;
  closureNoShow?: number;
  closureDialogadaPct?: number;
  closureUnilateralPct?: number;
  closureNoShowPct?: number;
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
  recovery_stage1_sent_at: string | null;
  recovery_stage2_sent_at: string | null;
  recovery_stage3_sent_at: string | null;
  converted: boolean;
  attempt_status: string | null;
  whatsapp_recovery_15min_sent_at: string | null;
  whatsapp_recovery_24h_sent_at: string | null;
  whatsapp_recovery_last_error: string | null;
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

interface ChurnDiagnosis {
  windowDays: number;
  totalCanceledInWindow: number;
  totalCanceled8_30d: number;
  totalCancelEventsRaw?: number;
  excludedDeletedProfile?: number;
  excludedOutOfRange?: number;
  byFeatureExposure: Record<string, { count: number; pct: number }>;
  engagementVolume: {
    avgMessagesUntilChurn: number;
    medianMessagesUntilChurn: number;
    avgActiveDaysUntilChurn: number;
    silentChurners: number;
  };
  bySegment: {
    naoExperimentou: { count: number; pct: number };
    experimentouParcial: { count: number; pct: number };
    experimentouMuito: { count: number; pct: number };
  };
  cancelDayHistogram: Record<string, number>;
  topReasons: { reason: string; count: number }[];
  verdict: 'exposure_problem' | 'fit_problem' | 'mixed' | 'insufficient_data';
}

export default function AdminEngagement() {
  const { isLoading, isAdmin, redirectIfNotAdmin } = useAdminAuth();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  // 🔍 Diagnóstico de Churn Precoce (D8-D30)
  const [churnDiag, setChurnDiag] = useState<ChurnDiagnosis | null>(null);
  const [churnDiagLoading, setChurnDiagLoading] = useState(false);
  const [churnWindowDays, setChurnWindowDays] = useState<number>(60);
  const [blasting, setBlasting] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date>(new Date());
  const [dateTo, setDateTo] = useState<Date>(new Date());
  const [recoverySessions, setRecoverySessions] = useState<RecoverySession[]>([]);
  const [recoveryStats, setRecoveryStats] = useState<{ raw: number; accepted: number }>({ raw: 0, accepted: 0 });
  const [whatsappStats, setWhatsappStats] = useState<{ stage1: number; stage2: number; errors: number; skipped: number; unique: number; converted: number }>({ stage1: 0, stage2: 0, errors: 0, skipped: 0, unique: 0, converted: 0 });
  const [dunningAttempts, setDunningAttempts] = useState<DunningAttempt[]>([]);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [dunningOpen, setDunningOpen] = useState(false);
  const [showAllRecovery, setShowAllRecovery] = useState(false);
  const [showAllDunning, setShowAllDunning] = useState(false);
  const [retentionStats, setRetentionStats] = useState<{
    offered: number;
    accepted: number;
    byTier: Record<string, number>;
    byGateway: Record<string, number>;
    canceled: number;
  }>({ offered: 0, accepted: 0, byTier: {}, byGateway: {}, canceled: 0 });
  const { toast } = useToast();
  const navigate = useNavigate();
  const requestIdRef = useRef(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const hasRecoveryActivity = recoverySessions.length > 0 || recoveryStats.raw > 0 || recoveryStats.accepted > 0 || whatsappStats.stage1 > 0 || whatsappStats.stage2 > 0 || whatsappStats.errors > 0 || whatsappStats.skipped > 0;

  // Cronômetro do botão "Atualizar" para feedback visual durante esperas longas.
  useEffect(() => {
    if (!loading) {
      setElapsedSec(0);
      return;
    }
    const startedAt = Date.now();
    const id = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [loading]);

  useEffect(() => {
    if (!isLoading) redirectIfNotAdmin();
  }, [isLoading, isAdmin]);

  const fetchMetrics = async (from: Date = dateFrom, to: Date = dateTo, forceRefresh = false) => {
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
          forceRefresh,
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

  // 🔍 Diagnóstico de Churn Precoce (D8-D30)
  const fetchChurnDiagnosis = async (windowDays = churnWindowDays, forceRefresh = false) => {
    setChurnDiagLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');
      const { data, error } = await supabase.functions.invoke('admin-churn-diagnosis', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { windowDays, forceRefresh },
      });
      if (error) throw error;
      setChurnDiag(data);
    } catch (err) {
      console.error('Error fetching churn diagnosis:', err);
      toast({
        title: 'Erro ao carregar diagnóstico de churn',
        description: err instanceof Error ? err.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setChurnDiagLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) fetchChurnDiagnosis(churnWindowDays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, churnWindowDays]);

  const fetchRecoverySessions = async () => {
    try {
      // Contagem bruta de tentativas (sem dedup) — todas as sessões com recovery_sent=true
      const { count: rawCount } = await supabase
        .from('checkout_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('recovery_sent', true);

      // Contagem de tentativas aceitas pela API (status do último attempt)
      const { count: acceptedCount } = await supabase
        .from('checkout_recovery_attempts')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'api_accepted');

      setRecoveryStats({ raw: rawCount || 0, accepted: acceptedCount || 0 });

      // Contagens de recuperação via WhatsApp (campos próprios em checkout_sessions)
      // "Pulado" (skipped: ...) NÃO é erro: é a trava de segurança do fluxo.
      // Erro = falha técnica de entrega de verdade.
      const [
        { count: waStage1Count },
        { count: waStage2Count },
        { count: waErrorsCount },
        { count: waSkippedCount },
      ] = await Promise.all([
        supabase.from('checkout_sessions').select('id', { count: 'exact', head: true }).not('whatsapp_recovery_15min_sent_at', 'is', null),
        supabase.from('checkout_sessions').select('id', { count: 'exact', head: true }).not('whatsapp_recovery_24h_sent_at', 'is', null),
        supabase.from('checkout_sessions').select('id', { count: 'exact', head: true })
          .not('whatsapp_recovery_last_error', 'is', null)
          .not('whatsapp_recovery_last_error', 'like', 'skipped:%'),
        supabase.from('checkout_sessions').select('id', { count: 'exact', head: true })
          .like('whatsapp_recovery_last_error', 'skipped:%'),
      ]);

      const { data: abandoned, error } = await supabase
        .from('checkout_sessions')
        .select('id, name, phone, email, plan, created_at, status, recovery_sent, recovery_sent_at, recovery_last_error, recovery_attempts_count, recovery_stage1_sent_at, recovery_stage2_sent_at, recovery_stage3_sent_at, whatsapp_recovery_15min_sent_at, whatsapp_recovery_24h_sent_at, whatsapp_recovery_last_error')
        .or('recovery_sent.eq.true,whatsapp_recovery_15min_sent_at.not.is.null,whatsapp_recovery_24h_sent_at.not.is.null,whatsapp_recovery_last_error.not.is.null')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      // Check which emails/phones later completed a checkout
      const emails = (abandoned || []).filter(s => s.email).map(s => s.email!);
      const phones = (abandoned || []).map(s => s.phone);
      const { data: completedByEmail } = emails.length > 0
        ? await supabase.from('checkout_sessions').select('email, completed_at, created_at').eq('status', 'completed').in('email', emails)
        : { data: [] };
      const { data: completedByPhone } = await supabase
        .from('checkout_sessions').select('phone, completed_at, created_at').eq('status', 'completed').in('phone', phones);

      const completedEmails = new Set((completedByEmail || []).map(c => c.email?.toLowerCase()));
      const completedPhones = new Set((completedByPhone || []).map(c => c.phone));

      // Mapa email/telefone -> timestamp mais recente de conclusão (para validar
      // se a conversão veio DEPOIS do WhatsApp ser disparado).
      const completedAtByEmail = new Map<string, number>();
      for (const c of (completedByEmail || [])) {
        if (!c.email) continue;
        const ts = new Date(c.completed_at || c.created_at).getTime();
        const key = c.email.toLowerCase();
        const prev = completedAtByEmail.get(key) || 0;
        if (ts > prev) completedAtByEmail.set(key, ts);
      }
      const completedAtByPhone = new Map<string, number>();
      for (const c of (completedByPhone || [])) {
        if (!c.phone) continue;
        const ts = new Date(c.completed_at || c.created_at).getTime();
        const prev = completedAtByPhone.get(c.phone) || 0;
        if (ts > prev) completedAtByPhone.set(c.phone, ts);
      }

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
          // Ignora tentativas de WhatsApp (wa_*): esta coluna é do fluxo de e-mail.
          if (a.status?.startsWith('wa_')) continue;
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

      const enriched = uniqueSessions.map(s => {
        // Só conta como "Converteu" se existe um checkout completed
        // ESTRITAMENTE POSTERIOR ao abandono desta linha. Sem essa checagem,
        // ex-clientes que pagaram no passado e abandonaram uma nova tentativa
        // herdam o badge "Converteu" indevidamente.
        const abandonedAt = new Date(s.created_at).getTime();
        const latestCompletedAt = Math.max(
          s.email ? (completedAtByEmail.get(s.email.toLowerCase()) || 0) : 0,
          s.phone ? (completedAtByPhone.get(s.phone) || 0) : 0,
        );
        return {
          ...s,
          converted: latestCompletedAt > abandonedAt,
          attempt_status: attemptMap.get(s.id) || null,
        };
      });
      setRecoverySessions(enriched as RecoverySession[]);

      // Stats WhatsApp: únicos = sessões com algum estágio enviado;
      // converted = pagaram ESTRITAMENTE DEPOIS do primeiro envio WhatsApp.
      // IMPORTANTE: calculamos `converted` sobre o UNIVERSO COMPLETO de sessões WA
      // (não só sobre o .limit(50) de abandoned usado para popular a tabela de detalhes).
      // Sem isso, conversões antigas não entram na contagem do card.
      const { data: allWaSessions } = await supabase
        .from('checkout_sessions')
        .select('email, phone, whatsapp_recovery_15min_sent_at, whatsapp_recovery_24h_sent_at')
        .or('whatsapp_recovery_15min_sent_at.not.is.null,whatsapp_recovery_24h_sent_at.not.is.null');

      const waList = allWaSessions || [];
      const waEmails = waList.filter(s => s.email).map(s => s.email!.toLowerCase());
      const waPhones = waList.map(s => s.phone).filter(Boolean);

      const [{ data: waCompletedByEmail }, { data: waCompletedByPhone }] = await Promise.all([
        waEmails.length > 0
          ? supabase.from('checkout_sessions').select('email, completed_at, created_at').eq('status', 'completed').in('email', waEmails)
          : Promise.resolve({ data: [] as any[] }),
        waPhones.length > 0
          ? supabase.from('checkout_sessions').select('phone, completed_at, created_at').eq('status', 'completed').in('phone', waPhones)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const waCompletedAtByEmail = new Map<string, number>();
      for (const c of (waCompletedByEmail || [])) {
        if (!c.email) continue;
        const ts = new Date(c.completed_at || c.created_at).getTime();
        const key = c.email.toLowerCase();
        const prev = waCompletedAtByEmail.get(key) || 0;
        if (ts > prev) waCompletedAtByEmail.set(key, ts);
      }
      const waCompletedAtByPhone = new Map<string, number>();
      for (const c of (waCompletedByPhone || [])) {
        if (!c.phone) continue;
        const ts = new Date(c.completed_at || c.created_at).getTime();
        const prev = waCompletedAtByPhone.get(c.phone) || 0;
        if (ts > prev) waCompletedAtByPhone.set(c.phone, ts);
      }

      const waConverted = waList.filter(s => {
        const sentTimes = [s.whatsapp_recovery_15min_sent_at, s.whatsapp_recovery_24h_sent_at]
          .filter(Boolean)
          .map(t => new Date(t as string).getTime());
        if (sentTimes.length === 0) return false;
        const firstSentAt = Math.min(...sentTimes);
        const completedAt = Math.max(
          s.email ? (waCompletedAtByEmail.get(s.email.toLowerCase()) || 0) : 0,
          s.phone ? (waCompletedAtByPhone.get(s.phone) || 0) : 0,
        );
        return completedAt > firstSentAt;
      }).length;

      setWhatsappStats({
        stage1: waStage1Count || 0,
        stage2: waStage2Count || 0,
        errors: waErrorsCount || 0,
        skipped: waSkippedCount || 0,
        unique: waList.length,
        converted: waConverted,
      });
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

  // Retenção — busca eventos do fluxo de cancelamento no período selecionado
  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const fromISO = new Date(dateFrom.setHours(0, 0, 0, 0)).toISOString();
      const toISO = new Date(dateTo.setHours(23, 59, 59, 999)).toISOString();
      const { data, error } = await supabase
        .from('retention_events')
        .select('tier, action, gateway, created_at')
        .gte('created_at', fromISO)
        .lte('created_at', toISO);
      if (error || !data) return;
      const stats = {
        offered: 0,
        accepted: 0,
        byTier: {} as Record<string, number>,
        byGateway: {} as Record<string, number>,
        canceled: 0,
      };
      for (const ev of data as Array<{ tier: string; action: string; gateway: string | null }>) {
        if (ev.action === 'offered') stats.offered += 1;
        if (ev.action === 'accepted') {
          stats.accepted += 1;
          stats.byTier[ev.tier] = (stats.byTier[ev.tier] || 0) + 1;
          const gw = ev.gateway || 'unknown';
          stats.byGateway[gw] = (stats.byGateway[gw] || 0) + 1;
        }
        if (ev.action === 'applied' && ev.tier === 'cancel') stats.canceled += 1;
      }
      setRetentionStats(stats);
    })();
  }, [isAdmin, dateFrom, dateTo]);

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
      <div className={cn("max-w-6xl mx-auto space-y-4 transition-opacity", loading && metrics && "opacity-70")}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/admin/configuracoes')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold text-foreground">Métricas de Engajamento</h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => navigate('/admin/whatsapp-inbox')}
            >
              Inbox WhatsApp
            </Button>
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
            <Button variant="outline" size="sm" onClick={() => fetchMetrics(dateFrom, dateTo, true)} disabled={loading} className="h-8">
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              {loading ? `Atualizando${elapsedSec > 2 ? ` ${elapsedSec}s` : '...'}` : 'Atualizar'}
            </Button>
            {metrics?._snapshot_computed_at && (
              <span
                className="text-[11px] text-muted-foreground"
                title={`Snapshot recalculado a cada 5 min • ${new Date(metrics._snapshot_computed_at as string).toLocaleString('pt-BR')}`}
              >
                atualizado há {(() => {
                  const s = Math.floor((Date.now() - new Date(metrics._snapshot_computed_at as string).getTime()) / 1000);
                  if (s < 60) return `${s}s`;
                  const m = Math.floor(s / 60);
                  if (m < 60) return `${m} min`;
                  return `${Math.floor(m / 60)}h`;
                })()}
              </span>
            )}
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

                {/* 🚀 Fase 2: Mini-cards de derivadas (ARR / ARPU / MRR Growth / Margem) */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {/* ARR */}
                  <Card>
                    <CardHeader className="p-3 pb-1">
                      <CardTitle className="text-xs font-medium text-muted-foreground">📅 ARR</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <div className="text-xl font-bold text-foreground">
                        R$ {(metrics.arrBRL ?? metrics.mrrTotalBRL * 12).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                      </div>
                      <p className="text-[11px] text-muted-foreground">projeção anualizada (MRR × 12)</p>
                    </CardContent>
                  </Card>

                  {/* ARPU */}
                  <Card>
                    <CardHeader className="p-3 pb-1">
                      <CardTitle className="text-xs font-medium text-muted-foreground">👤 ARPU</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <div className="text-xl font-bold text-foreground">
                        R$ {(metrics.arpuBRL ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </div>
                      <p className="text-[11px] text-muted-foreground">receita média por assinante/mês</p>
                    </CardContent>
                  </Card>

                  {/* MRR Growth */}
                  <Card>
                    <CardHeader className="p-3 pb-1">
                      <CardTitle className="text-xs font-medium text-muted-foreground">📈 MRR Growth (30d)</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <div className={`text-xl font-bold ${(metrics.mrrGrowthBRL ?? 0) > 0 ? 'text-green-600' : (metrics.mrrGrowthBRL ?? 0) < 0 ? 'text-destructive' : 'text-foreground'}`}>
                        {(metrics.mrrGrowthBRL ?? 0) > 0 ? '+' : ''}R$ {(metrics.mrrGrowthBRL ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        {metrics.mrrGrowthPct !== undefined && metrics.mrrGrowthPct !== 0 && (
                          <span className="text-xs ml-1">({metrics.mrrGrowthPct > 0 ? '+' : ''}{metrics.mrrGrowthPct}%)</span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        +R$ {(metrics.newMRRBRL ?? 0).toFixed(0)} novo · −R$ {(metrics.churnedMRRBRL ?? 0).toFixed(0)} churn
                      </p>
                    </CardContent>
                  </Card>

                  {/* Margem de contribuição */}
                  <Card>
                    <CardHeader className="p-3 pb-1">
                      <CardTitle className="text-xs font-medium text-muted-foreground">💚 Margem</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <div className={`text-xl font-bold ${(metrics.grossMarginPct ?? 0) >= 70 ? 'text-green-600' : (metrics.grossMarginPct ?? 0) >= 40 ? 'text-yellow-600' : 'text-destructive'}`}>
                        R$ {(metrics.grossMarginBRL ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                        <span className="text-xs ml-1">({metrics.grossMarginPct ?? 0}%)</span>
                      </div>
                      <p
                        className="text-[11px] text-muted-foreground cursor-help"
                        title={`Custo do período: R$ ${(metrics.totalCostBRL ?? 0).toFixed(2)} em ${metrics.periodDays ?? 0} dias → mensalizado: R$ ${(metrics.totalCostMonthlyBRL ?? 0).toFixed(2)}/mês`}
                      >
                        MRR mensal − custo IA mensalizado
                      </p>
                    </CardContent>
                  </Card>
                </div>

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

                  {/* 🛡️ Higiene de interpretação — correções por usuário */}
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
                      <CardTitle className="text-xs font-medium text-muted-foreground">🛡️ Correções / usuário</CardTitle>
                      <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      {(() => {
                        const perUser = metrics.correctionsPerUserInPeriod ?? 0;
                        const total = metrics.correctionsTotalInPeriod ?? 0;
                        const users = metrics.correctionsUsersInPeriod ?? 0;
                        const weekly = metrics.correctionsWeekly ?? [];
                        // Verde <=4, amarelo 4-8, vermelho >8 (baseline observado: 3-13/user).
                        const color = perUser <= 4 ? 'text-green-600' : perUser <= 8 ? 'text-yellow-600' : 'text-destructive';
                        const values = weekly.map(w => w.per_user);
                        const max = Math.max(1, ...values);
                        const w = 100;
                        const h = 24;
                        const pts = values.length > 1
                          ? values.map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / max) * h}`).join(' ')
                          : '';
                        return (
                          <>
                            <div className={`text-xl font-bold ${color}`}>{perUser.toFixed(2)}</div>
                            <p className="text-[11px] text-muted-foreground">{total} correções · {users} usuários (período)</p>
                            {values.length > 1 && (
                              <svg viewBox={`0 0 ${w} ${h}`} className="mt-1 w-full h-6" preserveAspectRatio="none">
                                <polyline
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                  className={color}
                                  points={pts}
                                />
                              </svg>
                            )}
                            <p className="text-[10px] text-muted-foreground">últimas {values.length}sem · pico {Math.max(...values, 0).toFixed(1)}</p>
                          </>
                        );
                      })()}
                    </CardContent>
                  </Card>

                  {/* 🧭 Fechamento de sessão — dialogada vs unilateral vs no-show */}
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
                      <CardTitle className="text-xs font-medium text-muted-foreground">🧭 Fechamento sessões</CardTitle>
                      <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      {(() => {
                        const total = metrics.closureTotal ?? 0;
                        const dPct = metrics.closureDialogadaPct ?? 0;
                        const uPct = metrics.closureUnilateralPct ?? 0;
                        const nPct = metrics.closureNoShowPct ?? 0;
                        // Verde >=75% dialogada, amarelo 55-75, vermelho <55.
                        const color = dPct >= 75 ? 'text-green-600' : dPct >= 55 ? 'text-yellow-600' : 'text-destructive';
                        return (
                          <>
                            <div className={`text-xl font-bold ${color}`}>{dPct.toFixed(1)}%</div>
                            <p className="text-[11px] text-muted-foreground">dialogadas · {total} sessões (período)</p>
                            <p className="text-[10px] text-muted-foreground mt-1">
                              unilateral {uPct.toFixed(1)}% · no-show {nPct.toFixed(1)}%
                            </p>
                          </>
                        );
                      })()}
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

                {/* 📊 Retenção por Coorte (Cohort Retention) — JANELAS */}
                {metrics.cohortRetention && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base font-semibold flex items-center gap-2">
                        📊 Retenção por Coorte (por janela)
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">
                        % de assinaturas que cancelaram <strong>dentro de cada janela</strong> do ciclo de vida (não cumulativo). Cada bucket considera apenas subs que <strong>sobreviveram até o início da janela</strong> e tiveram tempo de atravessá-la inteira.
                      </p>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {([
                          { key: 'churn0_7',   label: 'Churn 0-7 dias',   hint: 'Dropoff trial → 1ª cobrança', highlight: false },
                          { key: 'churn8_30',  label: 'Churn 8-30 dias',  hint: '1º ciclo mensal',             highlight: false },
                          { key: 'churn31_60', label: 'Churn 31-60 dias', hint: '🔥 Renovação 2ª mensalidade', highlight: true  },
                          { key: 'churn61_90', label: 'Churn 61-90 dias', hint: '3ª mensalidade',              highlight: false },
                        ] as const).map(({ key, label, hint, highlight }) => {
                          const bucket = metrics.cohortRetention![key];
                          const pct = bucket.pct;
                          // Cor: verde (<15%), amarelo (15-30%), vermelho (>30%)
                          const colorClass =
                            bucket.total === 0
                              ? 'border-muted bg-muted/20 text-muted-foreground'
                              : pct < 15
                                ? 'border-green-500/30 bg-green-500/5 text-green-700 dark:text-green-400'
                                : pct <= 30
                                  ? 'border-yellow-500/30 bg-yellow-500/5 text-yellow-700 dark:text-yellow-400'
                                  : 'border-destructive/40 bg-destructive/10 text-destructive';
                          return (
                            <div key={key} className={`border rounded-lg p-3 ${colorClass} ${highlight ? 'ring-2 ring-primary/40' : ''}`}>
                              <div className="text-[11px] font-medium text-muted-foreground mb-1">{label}</div>
                              <div className="text-2xl font-bold leading-tight">
                                {bucket.total === 0 ? '—' : `${pct.toFixed(1)}%`}
                              </div>
                              <div className="text-[11px] text-muted-foreground mt-1">
                                {bucket.canceled}/{bucket.total} subs
                              </div>
                              <div className="text-[10px] text-muted-foreground/80 mt-1.5 italic">{hint}</div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-3 p-2.5 bg-muted/30 rounded-md text-[11px] text-muted-foreground space-y-1">
                        <p>💡 <strong>Como ler:</strong> "Churn 31-60d = 20%" significa que <strong>20% das subs que sobreviveram aos 30 primeiros dias cancelaram entre o 31º e o 60º dia</strong> — exatamente quando rola a 2ª cobrança mensal.</p>
                        <p>🎯 <strong>Onde dói:</strong> 0-7d = onboarding/expectativa · 8-30d = valor percebido · <strong>31-60d = teste real da renovação</strong> · 61-90d = hábito consolidado.</p>
                        <p>🎨 <strong>Cores:</strong> <span className="text-green-600 dark:text-green-400 font-medium">verde &lt;15%</span> · <span className="text-yellow-600 dark:text-yellow-400 font-medium">amarelo 15-30%</span> · <span className="text-destructive font-medium">vermelho &gt;30%</span></p>
                      </div>

                      {/* ⏱️ Tempo médio até churn (90d) */}
                      {(metrics.churnedSubsCount90d ?? 0) > 0 && (
                        <div className="mt-3 p-3 border border-border rounded-md flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">⏱️</span>
                            <div>
                              <div className="text-sm font-medium text-foreground">
                                Quem cancela, cancela em média no <strong>D{metrics.avgDaysUntilChurn ?? 0}</strong> da assinatura
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                Baseado em {metrics.churnedSubsCount90d} cancelamentos nos últimos 90 dias (exclui D0).
                              </div>
                            </div>
                          </div>
                          <div className={`text-2xl font-bold ${(metrics.avgDaysUntilChurn ?? 0) < 14 ? 'text-destructive' : (metrics.avgDaysUntilChurn ?? 0) < 45 ? 'text-yellow-600' : 'text-green-600'}`}>
                            D{metrics.avgDaysUntilChurn ?? 0}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* 🔍 Diagnóstico de Churn Precoce (D8-D30) */}
                <Card>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                          🔍 Diagnóstico de Churn Precoce (D8-D30)
                        </CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">
                          Dos usuários que cancelaram entre o 8º e 30º dia, <strong>quantos efetivamente experimentaram</strong> as features de retenção que já existem? Resposta dita se o problema é <em>timing/exposição</em> ou <em>fit do produto</em>.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={churnWindowDays}
                          onChange={(e) => setChurnWindowDays(Number(e.target.value))}
                          className="text-xs border rounded px-2 py-1 bg-background"
                        >
                          <option value={30}>Últimos 30d</option>
                          <option value={60}>Últimos 60d</option>
                          <option value={90}>Últimos 90d</option>
                          <option value={180}>Últimos 180d</option>
                        </select>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => fetchChurnDiagnosis(churnWindowDays, true)}
                          disabled={churnDiagLoading}
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${churnDiagLoading ? 'animate-spin' : ''}`} />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {churnDiagLoading && !churnDiag && (
                      <div className="text-sm text-muted-foreground">Carregando diagnóstico…</div>
                    )}
                    {churnDiag && churnDiag.totalCanceled8_30d === 0 && (
                      <div className="text-sm text-muted-foreground p-3 bg-muted/30 rounded-md space-y-1">
                        <p>Sem cancelamentos analisáveis no intervalo D7-D30 nos últimos {churnDiag.windowDays} dias.</p>
                        <p className="text-[11px]">Eventos brutos: {churnDiag.totalCancelEventsRaw ?? churnDiag.totalCanceledInWindow} · Profiles deletados: {churnDiag.excludedDeletedProfile ?? 0} · Fora do range: {churnDiag.excludedOutOfRange ?? 0}</p>
                      </div>
                    )}
                    {churnDiag && churnDiag.totalCanceled8_30d > 0 && (
                      <>
                        {/* Veredicto */}
                        {(() => {
                          const v = churnDiag.verdict;
                          const cfg = v === 'exposure_problem'
                            ? { color: 'border-destructive/40 bg-destructive/10 text-destructive', label: '🚨 Problema é TIMING / EXPOSIÇÃO', text: 'A maioria cancelou sem ter testado as features de retenção. Antes de adicionar coisas novas, antecipe a entrega das que já existem para o D2-D14.' }
                            : v === 'fit_problem'
                              ? { color: 'border-green-500/30 bg-green-500/5 text-green-700 dark:text-green-400', label: '✅ Problema é FIT', text: 'A maioria experimentou várias features e ainda assim cancelou. Repensar oferta, pricing ou proposta de valor — adicionar features não vai resolver.' }
                              : v === 'mixed'
                                ? { color: 'border-yellow-500/30 bg-yellow-500/5 text-yellow-700 dark:text-yellow-400', label: '⚠️ MISTO', text: 'Há tanto problema de exposição quanto de fit. Ataque duplo: antecipar entregas E revisar oferta.' }
                                : { color: 'border-muted bg-muted/30 text-muted-foreground', label: 'ℹ️ Dados insuficientes', text: 'Poucos cancelamentos para conclusão estatística. Aguarde mais coorte.' };
                          return (
                            <div className={`border rounded-md p-3 ${cfg.color}`}>
                              <div className="text-sm font-semibold mb-1">{cfg.label}</div>
                              <div className="text-xs">{cfg.text}</div>
                            </div>
                          );
                        })()}

                        {/* 3 buckets de segmento */}
                        <div className="grid grid-cols-3 gap-3">
                          {([
                            { key: 'naoExperimentou', label: 'Não experimentou', hint: '0-1 features tocadas', color: 'border-destructive/40 bg-destructive/10 text-destructive' },
                            { key: 'experimentouParcial', label: 'Experimentou parcial', hint: '2-3 features', color: 'border-yellow-500/30 bg-yellow-500/5 text-yellow-700 dark:text-yellow-400' },
                            { key: 'experimentouMuito', label: 'Experimentou muito', hint: '4+ features', color: 'border-green-500/30 bg-green-500/5 text-green-700 dark:text-green-400' },
                          ] as const).map(({ key, label, hint, color }) => {
                            const b = churnDiag.bySegment[key];
                            return (
                              <div key={key} className={`border rounded-lg p-3 ${color}`}>
                                <div className="text-[11px] font-medium text-muted-foreground mb-1">{label}</div>
                                <div className="text-2xl font-bold leading-tight">{b.pct.toFixed(1)}%</div>
                                <div className="text-[11px] text-muted-foreground mt-1">{b.count} usuários</div>
                                <div className="text-[10px] text-muted-foreground/80 mt-1.5 italic">{hint}</div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Exposição por feature */}
                        <div>
                          <div className="text-xs font-medium text-foreground mb-2">% de cancelados D8-30 que tocaram cada feature antes de churnar</div>
                          <div className="space-y-1.5">
                            {(() => {
                              const labels: Record<string, string> = {
                                completedSession: 'Sessão 45min completa',
                                startedJourney: 'Iniciou jornada',
                                receivedOracleInsight: 'Insight do Oráculo',
                                receivedTrialInsight: 'Insight inicial (trial)',
                                receivedCapsule: 'Cápsula do tempo',
                                receivedMonthlyLetter: 'Carta mensal',
                                createdCommitment: 'Criou compromisso',
                                hasThemes: 'Temas detectados',
                              };
                              return Object.entries(churnDiag.byFeatureExposure)
                                .sort((a, b) => b[1].pct - a[1].pct)
                                .map(([key, v]) => (
                                  <div key={key} className="flex items-center gap-2">
                                    <div className="text-xs text-muted-foreground w-44 shrink-0">{labels[key] || key}</div>
                                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                      <div className="h-full bg-primary" style={{ width: `${Math.min(100, v.pct)}%` }} />
                                    </div>
                                    <div className="text-[11px] text-muted-foreground w-20 text-right tabular-nums">
                                      {v.count} <span className="text-muted-foreground/70">({v.pct.toFixed(1)}%)</span>
                                    </div>
                                  </div>
                                ));
                            })()}
                          </div>
                        </div>

                        {/* Volume de engajamento */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="border rounded-md p-3">
                            <div className="text-[11px] text-muted-foreground">Msgs até churn (média)</div>
                            <div className="text-lg font-bold">{churnDiag.engagementVolume.avgMessagesUntilChurn}</div>
                          </div>
                          <div className="border rounded-md p-3">
                            <div className="text-[11px] text-muted-foreground">Msgs até churn (mediana)</div>
                            <div className="text-lg font-bold">{churnDiag.engagementVolume.medianMessagesUntilChurn}</div>
                          </div>
                          <div className="border rounded-md p-3">
                            <div className="text-[11px] text-muted-foreground">Dias ativos (média)</div>
                            <div className="text-lg font-bold">{churnDiag.engagementVolume.avgActiveDaysUntilChurn}</div>
                          </div>
                          <div className="border rounded-md p-3">
                            <div className="text-[11px] text-muted-foreground">Silent churners</div>
                            <div className="text-lg font-bold">{churnDiag.engagementVolume.silentChurners}</div>
                            <div className="text-[10px] text-muted-foreground/80 italic">cancelaram com 0 msgs</div>
                          </div>
                        </div>

                        {/* Histograma D8-D30 */}
                        <div>
                          <div className="text-xs font-medium text-foreground mb-2">Em qual dia cancelaram (D8 → D30)</div>
                          {(() => {
                            const days = Array.from({ length: 23 }, (_, i) => i + 8);
                            const max = Math.max(1, ...days.map(d => churnDiag.cancelDayHistogram[String(d)] || 0));
                            return (
                              <div className="flex items-end gap-1 h-24">
                                {days.map(d => {
                                  const v = churnDiag.cancelDayHistogram[String(d)] || 0;
                                  const h = (v / max) * 100;
                                  return (
                                    <div key={d} className="flex-1 flex flex-col items-center gap-0.5" title={`D${d}: ${v} cancelamento(s)`}>
                                      <div className="w-full bg-primary/70 rounded-t" style={{ height: `${h}%`, minHeight: v > 0 ? 2 : 0 }} />
                                      <div className="text-[9px] text-muted-foreground">{d}</div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>

                        {/* Top razões */}
                        {churnDiag.topReasons.length > 0 && (
                          <div>
                            <div className="text-xs font-medium text-foreground mb-2">Razões declaradas no cancelamento</div>
                            <div className="flex flex-wrap gap-1.5">
                              {churnDiag.topReasons.slice(0, 8).map(({ reason, count }) => (
                                <span key={reason} className="text-[10px] px-2 py-0.5 rounded-full bg-background border">
                                  <strong>{count}</strong> · {reason}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="text-[11px] text-muted-foreground space-y-1">
                          <p>📊 Base analisada: <strong>{churnDiag.totalCanceled8_30d}</strong> cancelamentos D7-30d (com profile íntegro) — de <strong>{churnDiag.totalCancelEventsRaw ?? churnDiag.totalCanceledInWindow}</strong> eventos brutos nos últimos {churnDiag.windowDays} dias.</p>
                          {(churnDiag.excludedDeletedProfile ?? 0) > 0 && (
                            <p>⚠️ {churnDiag.excludedDeletedProfile} excluídos: profile já deletado pelo cleanup de inativos (sem como medir lifetime ou exposição).</p>
                          )}
                          {(churnDiag.excludedOutOfRange ?? 0) > 0 && (
                            <p>↳ {churnDiag.excludedOutOfRange} fora da janela D7-D30 (cancelaram antes ou depois).</p>
                          )}
                        </div>
                      </>
                    )}
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
                    <p>• <strong>Correções / usuário:</strong> quantas vezes, em média, cada usuário corrigiu uma leitura da Aura no período. Baseline 3-13. Meta: ≤4 (verde). Sparkline = últimas 8 semanas.</p>
                    <p>• <strong>ARR / ARPU:</strong> ARR = MRR × 12 (projeção anualizada). ARPU = MRR ÷ assinaturas ativas (receita média por usuário/mês).</p>
                    <p>• <strong>MRR Growth (30d):</strong> soma do MRR das assinaturas <strong>novas</strong> criadas nos últimos 30d menos o MRR <strong>perdido</strong> por cancelamentos no mesmo período. % calculado sobre o MRR estimado no início do período.</p>
                    <p>• <strong>Margem de contribuição:</strong> MRR mensal menos custo de IA <strong>mensalizado</strong> (custo do período × 30 ÷ dias do período). Garante que ambos os lados estão na mesma escala temporal — a margem fica estável independente do filtro de data. Verde ≥70%, amarelo 40-70%, vermelho &lt;40%.</p>
                    <p>• <strong>Tempo médio até churn:</strong> média de dias-de-vida das assinaturas canceladas nos últimos 90d (exclui cancelamentos no D0 = lixo/duplicatas).</p>
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
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <MessageCircle className="h-4 w-4" />
                  Recuperação por WhatsApp
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Checkout abandonado — 2 estágios automáticos (15min e 24h)
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                  <div>
                    <div className="text-xl font-bold text-foreground">{whatsappStats.stage1}</div>
                    <p className="text-[11px] text-muted-foreground">processados 15min</p>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-foreground">{whatsappStats.stage2}</div>
                    <p className="text-[11px] text-muted-foreground">processados 24h</p>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-foreground">{whatsappStats.unique}</div>
                    <p className="text-[11px] text-muted-foreground">usuários únicos</p>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-foreground">{whatsappStats.converted}</div>
                    <p className="text-[11px] text-muted-foreground">converteram</p>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-foreground">{whatsappStats.skipped}</div>
                    <p className="text-[11px] text-muted-foreground">pulados (trava)</p>
                  </div>
                  <div>
                    <div className={`text-xl font-bold ${whatsappStats.errors > 0 ? 'text-destructive' : 'text-foreground'}`}>{whatsappStats.errors}</div>
                    <p className="text-[11px] text-muted-foreground">erros de entrega</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {loading && !metrics ? <SkeletonCards /> : (
              <>
                {/* 1. Cards de métricas */}
                <MetricCards cards={trialCards} />

                {/* 1b. Escada de retenção (cancel flow) */}
                <div className="space-y-2">
                  <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                    <Heart className="h-4 w-4" />
                    Retenção — Fluxo de Cancelamento ({periodLabel})
                  </h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
                        <CardTitle className="text-xs font-medium text-muted-foreground">Cancelamentos Retidos</CardTitle>
                        <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </CardHeader>
                      <CardContent className="p-3 pt-0">
                        <div className="text-xl font-bold text-foreground">{retentionStats.accepted}</div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">aceitaram oferta em vez de cancelar</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
                        <CardTitle className="text-xs font-medium text-muted-foreground">Save Rate</CardTitle>
                        <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                      </CardHeader>
                      <CardContent className="p-3 pt-0">
                        <div className="text-xl font-bold text-foreground">
                          {retentionStats.accepted + retentionStats.canceled > 0
                            ? Math.round((retentionStats.accepted / (retentionStats.accepted + retentionStats.canceled)) * 100)
                            : 0}%
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{retentionStats.accepted} salvos / {retentionStats.accepted + retentionStats.canceled} chegaram ao fim</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
                        <CardTitle className="text-xs font-medium text-muted-foreground">Por Tier</CardTitle>
                        <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
                      </CardHeader>
                      <CardContent className="p-3 pt-0">
                        <div className="text-[11px] text-muted-foreground space-y-0.5">
                          <div>Pausa: <span className="font-semibold text-foreground">{retentionStats.byTier.pause || 0}</span></div>
                          <div>30% off: <span className="font-semibold text-foreground">{retentionStats.byTier.discount_30 || 0}</span></div>
                          <div>Lite: <span className="font-semibold text-foreground">{retentionStats.byTier.lite || 0}</span></div>
                          <div>Base: <span className="font-semibold text-foreground">{retentionStats.byTier.base || 0}</span></div>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
                        <CardTitle className="text-xs font-medium text-muted-foreground">Por Gateway</CardTitle>
                        <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
                      </CardHeader>
                      <CardContent className="p-3 pt-0">
                        <div className="text-[11px] text-muted-foreground space-y-0.5">
                          <div>Stripe: <span className="font-semibold text-foreground">{retentionStats.byGateway.stripe || 0}</span></div>
                          <div>Asaas cartão: <span className="font-semibold text-foreground">{retentionStats.byGateway.asaas_card || 0}</span></div>
                          <div>Asaas PIX: <span className="font-semibold text-foreground">{retentionStats.byGateway.asaas_pix || 0}</span></div>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
                        <CardTitle className="text-xs font-medium text-muted-foreground">Cancelaram no Fluxo</CardTitle>
                        <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                      </CardHeader>
                      <CardContent className="p-3 pt-0">
                        <div className="text-xl font-bold text-foreground">{retentionStats.canceled}</div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">recusaram a escada</p>
                      </CardContent>
                    </Card>
                  </div>
                </div>

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
                      {periodLabel} — All-time: {metrics?.checkoutCreatedTotalAllTime ?? metrics?.checkoutCreatedAllTime ?? 0} criados, {metrics?.checkoutCompletedTotalAllTime ?? metrics?.checkoutCompletedAllTime ?? 0} finalizados (cartão + PIX)
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {metrics && (
                      (() => {
                        const created = metrics.checkoutCreatedTotalInPeriod ?? metrics.checkoutCreatedInPeriod;
                        const completed = metrics.checkoutCompletedTotalInPeriod ?? metrics.checkoutCompletedInPeriod;
                        const dropoff = Math.max(0, created - completed);
                        const rate = created > 0 ? Math.round((completed / created) * 1000) / 10 : 0;
                        return (
                          <>
                            <FunnelStep label="Clicaram para Pagar (sessão criada)" value={created} total={created} color="bg-blue-500" />
                            <FunnelStep label="Finalizaram Pagamento" value={completed} total={created} color="bg-green-500" />
                            <div className="flex justify-between text-sm pt-2 border-t border-border">
                              <span className="text-muted-foreground">Desistiram no pagamento</span>
                              <span className="font-semibold text-destructive">{dropoff} <span className="text-muted-foreground font-normal">({created > 0 ? Math.round((dropoff / created) * 100) : 0}%)</span></span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Taxa de finalização</span>
                              <span className="font-semibold text-foreground">{rate}%</span>
                            </div>
                          </>
                        );
                      })()
                    )}
                  </CardContent>
                </Card>

                {/* 4. Funil de Conversão */}
                {/* 3b. PIX Automático (Bacen) — saúde do consentimento recorrente */}
                {metrics?.pixAuto && (metrics.pixAuto.createdInPeriod > 0 || metrics.pixAuto.activeTotal > 0) && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <ShoppingCart className="h-4 w-4" />
                        PIX Automático (período)
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {periodLabel} — a etapa crítica é a autorização da cobrança automática no app do banco.
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FunnelStep
                        label="Autorizações criadas (QR gerado)"
                        value={metrics.pixAuto.createdInPeriod}
                        total={metrics.pixAuto.createdInPeriod}
                        color="bg-blue-500"
                      />
                      <FunnelStep
                        label="Autorizadas no banco (recorrência ativa)"
                        value={metrics.pixAuto.activatedInPeriod}
                        total={metrics.pixAuto.createdInPeriod}
                        color="bg-green-500"
                      />
                      <div className="flex justify-between text-sm pt-2 border-t border-border">
                        <span className="text-muted-foreground">Perdidas sem autorização</span>
                        <span className="font-semibold text-destructive">{metrics.pixAuto.lostInPeriod}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Taxa de autorização</span>
                        <span className="font-semibold text-foreground">{metrics.pixAuto.authorizationRate}%</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Ativas hoje / aguardando</span>
                        <span className="font-semibold text-foreground">
                          {metrics.pixAuto.activeTotal} / {metrics.pixAuto.pendingNow}
                        </span>
                      </div>
                      {metrics.pixAuto.autodebitFailures.length > 0 && (
                        <div className="pt-3 border-t border-border space-y-2">
                          <p className="text-xs font-semibold text-destructive">
                            Débito automático não disparou ({metrics.pixAuto.autodebitFailures.length})
                          </p>
                          {metrics.pixAuto.autodebitFailures.slice(0, 8).map((f, i) => (
                            <div key={i} className="flex justify-between text-xs">
                              <span className="text-muted-foreground truncate mr-2">{f.email || '—'}</span>
                              <span className="text-foreground whitespace-nowrap">
                                {f.plan || '—'}{f.hasSubscription ? '' : ' · sem assinatura'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

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
                {hasRecoveryActivity && (
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
                            <Mail className="inline h-3 w-3 mr-1" />
                            <strong>E-mail:</strong> {recoveryStats.raw} tentativas brutas — {recoverySessions.length} usuários únicos — {recoveryStats.accepted} aceitas pela API — {recoverySessions.filter(s => s.converted).length} converteram
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            <MessageCircle className="inline h-3 w-3 mr-1 text-emerald-600" />
                            <strong>WhatsApp:</strong> {whatsappStats.stage1} em 15min · {whatsappStats.stage2} em 24h · {whatsappStats.unique} únicos · {whatsappStats.converted} converteram · {whatsappStats.skipped} pulados · {whatsappStats.errors} erros de entrega
                          </p>
                          <p className="text-[11px] text-muted-foreground/80 mt-1">
                            Cadências: e-mail = 3 estágios (1h / 25h / 97h) · WhatsApp = 2 estágios (15min / 24h). "Pulado" é a trava de segurança (telefone já contatado, cliente ativo, já pagou), não falha de envio.
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
                                <TableHead>Telefone</TableHead>
                                <TableHead>Plano</TableHead>
                                <TableHead>Abandono</TableHead>
                                <TableHead>Envio e-mail</TableHead>
                                <TableHead>Recup. WhatsApp</TableHead>
                                <TableHead>Resultado</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(showAllRecovery ? recoverySessions : recoverySessions.slice(0, 5)).map((s) => {
                                const planNames: Record<string, string> = { essencial: 'Essencial', direcao: 'Direção', transformacao: 'Transformação' };
                                const maskedEmail = s.email ? `${s.email.substring(0, 3)}***@${s.email.split('@')[1] || ''}` : '—';
                                const attemptStatus = s.attempt_status;
                                // Estágio real do fluxo de 3 e-mails: stage_1_sent / stage_2_sent / stage_3_sent.
                                const stageMatch = attemptStatus?.match(/^stage_(\d)_(sent|failed|skipped)$/);
                                const emailStage = s.recovery_stage3_sent_at ? 3 : s.recovery_stage2_sent_at ? 2 : s.recovery_stage1_sent_at ? 1 : null;
                                const sendBadge = stageMatch && stageMatch[2] === 'sent'
                                  ? <Badge className="bg-emerald-600 text-white text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" />{emailStage ?? stageMatch[1]}/3 enviados</Badge>
                                  : stageMatch && stageMatch[2] === 'failed'
                                  ? <Badge variant="destructive" className="text-[10px]" title={s.recovery_last_error || undefined}><AlertCircle className="h-3 w-3 mr-1" />Falhou no {stageMatch[1]}º</Badge>
                                  : stageMatch && stageMatch[2] === 'skipped'
                                  ? <Badge variant="outline" className="text-[10px]" title={s.recovery_last_error || undefined}>{skipLabel(s.recovery_last_error)}</Badge>
                                  : attemptStatus === 'api_accepted'
                                  ? <Badge className="bg-emerald-600 text-white text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" />Enviado</Badge>
                                  : attemptStatus === 'failed' || attemptStatus === 'error'
                                  ? <Badge variant="destructive" className="text-[10px]"><AlertCircle className="h-3 w-3 mr-1" />{s.recovery_last_error?.substring(0, 30) || 'Falhou'}</Badge>
                                  : attemptStatus === 'skipped' || attemptStatus === 'skipped_active_customer'
                                  ? <Badge variant="outline" className="text-[10px]">{attemptStatus === 'skipped_active_customer' ? 'Cliente ativo' : 'Sem email'}</Badge>
                                  : <Badge variant="secondary" className="text-[10px]">Legado</Badge>;
                                // "skipped: motivo" não é erro — o estágio mais recente preenchido foi pulado.
                                const waSkipped = (s.whatsapp_recovery_last_error || '').startsWith('skipped:');
                                const waError = s.whatsapp_recovery_last_error && !waSkipped;
                                const show24h = !!s.whatsapp_recovery_24h_sent_at && !(waSkipped && !!s.whatsapp_recovery_24h_sent_at);
                                const show15min = !!s.whatsapp_recovery_15min_sent_at
                                  && !(waSkipped && !s.whatsapp_recovery_24h_sent_at);
                                return (
                                  <TableRow key={s.id}>
                                    <TableCell className="font-medium">{s.name || '—'}</TableCell>
                                    <TableCell className="text-xs">{maskedEmail}</TableCell>
                                    <TableCell className="text-xs">
                                      {s.phone ? (
                                        <a
                                          href={`https://wa.me/${s.phone.replace(/\D/g, '')}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-primary hover:underline"
                                          title="Abrir conversa no WhatsApp"
                                        >
                                          {s.phone}
                                        </a>
                                      ) : '—'}
                                    </TableCell>
                                    <TableCell>{planNames[s.plan || ''] || s.plan || '—'}</TableCell>
                                    <TableCell className="text-xs">{format(new Date(s.created_at), 'dd/MM HH:mm')}</TableCell>
                                    <TableCell>{sendBadge}</TableCell>
                                    <TableCell>
                                      <div className="flex flex-col gap-1">
                                        {show15min && (
                                          <Badge className="bg-emerald-600 text-white text-[10px] w-fit">15min ✓</Badge>
                                        )}
                                        {show24h && (
                                          <Badge className="bg-emerald-600 text-white text-[10px] w-fit">24h ✓</Badge>
                                        )}
                                        {waSkipped && (
                                          <Badge variant="secondary" className="text-[10px] w-fit" title={s.whatsapp_recovery_last_error || undefined}>
                                            {skipLabel(s.whatsapp_recovery_last_error)}
                                          </Badge>
                                        )}
                                        {waError && (
                                          <Badge variant="destructive" className="text-[10px] w-fit" title={s.whatsapp_recovery_last_error}>
                                            <AlertCircle className="h-3 w-3 mr-1" />Erro
                                          </Badge>
                                        )}
                                        {!show15min && !show24h && !s.whatsapp_recovery_last_error && (
                                          <span className="text-xs text-muted-foreground">—</span>
                                        )}
                                      </div>
                                    </TableCell>
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
