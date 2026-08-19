import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Search, Pencil, RotateCcw, ChevronLeft, ChevronRight, Link, Copy, Check, Star, RefreshCw, AlertTriangle, MessageSquare, Ban } from 'lucide-react';

interface Profile {
  id: string;
  user_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  plan: string | null;
  status: string | null;
  created_at: string | null;
  last_user_message_at: string | null;
  current_episode: number | null;
  current_journey_id: string | null;
  sessions_used_this_month: number | null;
  trial_phase: string | null;
  pending_first_session_invite: boolean | null;
  first_session_invite_attempts: number | null;
  needs_schedule_setup: boolean | null;
  whatsapp_provider: string | null;
}

interface RatingAgg { avg: number; count: number; }

interface AbandonedSession {
  id: string;
  scheduled_at: string;
  started_at: string | null;
  ended_at: string | null;
  duration_minutes: number;
  focus_topic: string | null;
}

interface SessionStats {
  done: number;
  abandoned: number;
  noshow: number;
  upcoming: number;
  lastCompletedAt: string | null;
  lastAbandonedAt: string | null;
  abandonedList: AbandonedSession[];
}

const PAGE_SIZE = 20;

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-800 border-green-200',
  paused: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  canceled: 'bg-red-100 text-red-800 border-red-200',
  inactive: 'bg-red-100 text-red-800 border-red-200',
  trial: 'bg-blue-100 text-blue-800 border-blue-200',
};

const planColors: Record<string, string> = {
  essencial: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  direcao: 'bg-purple-100 text-purple-800 border-purple-200',
  transformacao: 'bg-amber-100 text-amber-800 border-amber-200',
  trial: 'bg-blue-100 text-blue-800 border-blue-200',
};

type D0Status = 'pendente' | 'tentando' | 'recusado' | 'agendado' | 'concluido' | 'sem_dados';

function getD0Status(p: Profile, s?: SessionStats): D0Status {
  const pending = p.pending_first_session_invite;
  const attempts = p.first_session_invite_attempts ?? 0;
  const needsSetup = p.needs_schedule_setup;
  if (pending && attempts === 0) return 'pendente';
  if (pending && attempts >= 1) return 'tentando';
  if (!pending && needsSetup) return 'recusado';
  // Profile não distingue mais — usa sessions
  if (s) {
    if (s.done >= 1) return 'concluido';
    if (s.upcoming >= 1 || s.abandoned >= 1 || s.noshow >= 1) return 'agendado';
    return 'sem_dados';
  }
  // Sem dados de sessões carregados ainda — fallback conservador
  return 'sem_dados';
}

const d0Labels: Record<D0Status, string> = {
  pendente: 'Pendente',
  tentando: 'Tentando',
  recusado: 'Recusou→Setup',
  agendado: 'Agendado',
  concluido: 'Fez 1ª sessão',
  sem_dados: 'Sem dados',
};

const d0Colors: Record<D0Status, string> = {
  pendente: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  tentando: 'bg-blue-100 text-blue-800 border-blue-200',
  recusado: 'bg-orange-100 text-orange-800 border-orange-200',
  agendado: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  concluido: 'bg-green-100 text-green-800 border-green-200',
  sem_dados: 'bg-gray-100 text-gray-700 border-gray-200',
};

export default function AdminUsers() {
  const { isLoading: authLoading, isAdmin, redirectIfNotAdmin } = useAdminAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [ratings, setRatings] = useState<Record<string, RatingAgg>>({});
  const [sessionStats, setSessionStats] = useState<Record<string, SessionStats>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [periodFilter, setPeriodFilter] = useState<'all' | 'today' | '7d' | '30d'>('all');
  const [d0Filter, setD0Filter] = useState<'all' | D0Status>('all');
  const [sessionFilter, setSessionFilter] = useState<'all' | 'with_abandoned' | 'with_noshow' | 'done_without_rating' | 'low_rating'>('all');
  const [sortFilter, setSortFilter] = useState<'newest' | 'oldest' | 'last_contact' | 'highest_rating' | 'lowest_rating'>('newest');

  // Edit dialog
  const [editProfile, setEditProfile] = useState<Profile | null>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', plan: '', status: '', whatsapp_provider: 'default' });
  const [cancelingGateway, setCancelingGateway] = useState(false);
  const [saving, setSaving] = useState(false);
  const [portalLinkLoading, setPortalLinkLoading] = useState(false);
  const [portalLinkCopied, setPortalLinkCopied] = useState(false);

  // Abandono drill-down dialog
  const [abandonProfile, setAbandonProfile] = useState<Profile | null>(null);
  const [abandonDetails, setAbandonDetails] = useState<Array<AbandonedSession & { lastUserMessage?: string; lastUserMessageAt?: string }>>([]);
  const [abandonLoading, setAbandonLoading] = useState(false);

  useEffect(() => {
    if (!authLoading) redirectIfNotAdmin();
  }, [authLoading, isAdmin]);

  useEffect(() => {
    if (isAdmin) fetchProfiles();
  }, [isAdmin, page, search, periodFilter, d0Filter, sortFilter, sessionFilter]);

  const fetchProfiles = async () => {
    setLoading(true);
    let query = supabase
      .from('profiles')
      .select('id, user_id, name, phone, email, plan, status, created_at, last_user_message_at, current_episode, current_journey_id, sessions_used_this_month, trial_phase, pending_first_session_invite, first_session_invite_attempts, needs_schedule_setup, whatsapp_provider', { count: 'exact' })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    // Ordenação server-side (rating é client-side após carregar a página)
    if (sortFilter === 'newest') {
      query = query.order('created_at', { ascending: false });
    } else if (sortFilter === 'oldest') {
      query = query.order('created_at', { ascending: true });
    } else if (sortFilter === 'last_contact') {
      query = query.order('last_user_message_at', { ascending: false, nullsFirst: false });
    } else {
      // highest_rating / lowest_rating: ordenação default por created_at desc, reordenado client-side
      query = query.order('created_at', { ascending: false });
    }

    if (search.trim()) {
      query = query.or(`name.ilike.%${search.trim()}%,phone.ilike.%${search.trim()}%,email.ilike.%${search.trim()}%`);
    }

    // Filtro por período (created_at)
    if (periodFilter !== 'all') {
      const now = new Date();
      const cutoff = new Date(now);
      if (periodFilter === 'today') cutoff.setHours(0, 0, 0, 0);
      else if (periodFilter === '7d') cutoff.setDate(now.getDate() - 7);
      else if (periodFilter === '30d') cutoff.setDate(now.getDate() - 30);
      query = query.gte('created_at', cutoff.toISOString());
    }

    // Filtro por status D0
    if (d0Filter === 'pendente') {
      query = query.eq('pending_first_session_invite', true).eq('first_session_invite_attempts', 0);
    } else if (d0Filter === 'tentando') {
      query = query.eq('pending_first_session_invite', true).gte('first_session_invite_attempts', 1);
    } else if (d0Filter === 'recusado') {
      query = query.eq('pending_first_session_invite', false).eq('needs_schedule_setup', true);
    } else if (d0Filter === 'concluido' || d0Filter === 'agendado' || d0Filter === 'sem_dados') {
      // Server: filtra o bucket amplo; refinamento real é client-side via sessionStats
      query = query.eq('pending_first_session_invite', false).eq('needs_schedule_setup', false);
    }

    const { data, count, error } = await query;
    if (error) {
      console.error('Error fetching profiles:', error);
      setProfiles([]);
      setTotal(0);
      setRatings({});
    } else {
      const list = (data || []) as Profile[];
      setTotal(count || 0);
      const userIds = list.map(p => p.user_id);
      const [ratingsMap, statsMap] = await Promise.all([
        fetchRatings(userIds),
        fetchSessionStats(userIds),
      ]);
      // Ordenação client-side por rating
      let finalList = list;
      if (sortFilter === 'highest_rating' || sortFilter === 'lowest_rating') {
        const dir = sortFilter === 'highest_rating' ? -1 : 1;
        finalList = [...list].sort((a, b) => {
          const ra = ratingsMap[a.user_id]?.avg ?? -Infinity * dir;
          const rb = ratingsMap[b.user_id]?.avg ?? -Infinity * dir;
          // Sem rating sempre por último
          const aHas = ratingsMap[a.user_id] !== undefined;
          const bHas = ratingsMap[b.user_id] !== undefined;
          if (aHas && !bHas) return -1;
          if (!aHas && bHas) return 1;
          if (!aHas && !bHas) return 0;
          return (ra - rb) * dir;
        });
      }
      // Filtros client-side baseados em sessões/ratings (operam sobre a página atual)
      if (sessionFilter !== 'all') {
        finalList = finalList.filter(p => {
          const s = statsMap[p.user_id];
          const r = ratingsMap[p.user_id];
          if (sessionFilter === 'with_abandoned') return (s?.abandoned ?? 0) > 0;
          if (sessionFilter === 'with_noshow') return (s?.noshow ?? 0) > 0;
          if (sessionFilter === 'done_without_rating') return (s?.done ?? 0) > 0 && !r;
          if (sessionFilter === 'low_rating') return !!r && r.avg <= 3;
          return true;
        });
      }
      // Refinamento client-side do filtro D0 quando dependente de sessions
      if (d0Filter === 'concluido' || d0Filter === 'agendado' || d0Filter === 'sem_dados') {
        finalList = finalList.filter(p => getD0Status(p, statsMap[p.user_id]) === d0Filter);
      }
      setProfiles(finalList);
    }
    setLoading(false);
  };

  const fetchRatings = async (userIds: string[]): Promise<Record<string, RatingAgg>> => {
    if (!userIds.length) { setRatings({}); return {}; }
    const { data, error } = await supabase
      .from('session_ratings')
      .select('user_id, rating')
      .in('user_id', userIds);
    if (error) { console.error('Error fetching ratings:', error); setRatings({}); return {}; }
    const agg: Record<string, { sum: number; count: number }> = {};
    (data || []).forEach((r: any) => {
      if (!agg[r.user_id]) agg[r.user_id] = { sum: 0, count: 0 };
      agg[r.user_id].sum += r.rating;
      agg[r.user_id].count += 1;
    });
    const result: Record<string, RatingAgg> = {};
    Object.entries(agg).forEach(([uid, v]) => {
      result[uid] = { avg: v.sum / v.count, count: v.count };
    });
    setRatings(result);
    return result;
  };

  const fetchSessionStats = async (userIds: string[]): Promise<Record<string, SessionStats>> => {
    if (!userIds.length) { setSessionStats({}); return {}; }
    const { data, error } = await supabase
      .from('sessions')
      .select('id, user_id, status, started_at, ended_at, scheduled_at, duration_minutes, focus_topic')
      .in('user_id', userIds);
    if (error) { console.error('Error fetching session stats:', error); setSessionStats({}); return {}; }

    const now = Date.now();
    const result: Record<string, SessionStats> = {};
    const ensure = (uid: string): SessionStats => {
      if (!result[uid]) result[uid] = {
        done: 0, abandoned: 0, noshow: 0, upcoming: 0,
        lastCompletedAt: null, lastAbandonedAt: null, abandonedList: [],
      };
      return result[uid];
    };

    // Garante entrada zerada para TODOS os usuários da página, mesmo sem sessões,
    // para que getD0Status receba stats concretos (done=0 → 'sem_dados') em vez
    // de cair no fallback que retornava 'concluido' incorretamente.
    userIds.forEach(uid => ensure(uid));

    (data || []).forEach((s: any) => {
      const stats = ensure(s.user_id);
      const scheduledMs = s.scheduled_at ? new Date(s.scheduled_at).getTime() : 0;
      const durationMs = (s.duration_minutes || 45) * 60_000;
      const startedMs = s.started_at ? new Date(s.started_at).getTime() : 0;
      const endedMs = s.ended_at ? new Date(s.ended_at).getTime() : 0;

      if (s.status === 'completed' && endedMs) {
        stats.done += 1;
        if (!stats.lastCompletedAt || endedMs > new Date(stats.lastCompletedAt).getTime()) {
          stats.lastCompletedAt = s.ended_at;
        }
      } else if (s.status === 'scheduled' && !startedMs) {
        // Sem início: futura ou no-show
        if (scheduledMs > now) {
          stats.upcoming += 1;
        } else if (scheduledMs + 60 * 60_000 < now) {
          stats.noshow += 1;
        }
      } else if (startedMs && !endedMs && s.status !== 'canceled') {
        // Iniciou e nunca terminou: abandonada se passou da janela esperada
        if (scheduledMs + durationMs + 30 * 60_000 < now) {
          stats.abandoned += 1;
          if (!stats.lastAbandonedAt || startedMs > new Date(stats.lastAbandonedAt).getTime()) {
            stats.lastAbandonedAt = s.started_at;
          }
          stats.abandonedList.push({
            id: s.id,
            scheduled_at: s.scheduled_at,
            started_at: s.started_at,
            ended_at: s.ended_at,
            duration_minutes: s.duration_minutes,
            focus_topic: s.focus_topic,
          });
        }
      }
    });

    setSessionStats(result);
    return result;
  };

  const openEdit = (p: Profile) => {
    setEditProfile(p);
    setPortalLinkCopied(false);
    setEditForm({
      name: p.name || '',
      email: p.email || '',
      phone: p.phone || '',
      plan: p.plan || 'essencial',
      status: p.status || 'active',
      whatsapp_provider: p.whatsapp_provider || 'default',
    });
  };

  const handleCopyPortalLink = async () => {
    if (!editProfile) return;
    setPortalLinkLoading(true);
    try {
      // Check for existing token
      const { data: existing } = await supabase
        .from('user_portal_tokens')
        .select('token')
        .eq('user_id', editProfile.user_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let token = existing?.token;
      if (!token) {
        const { data: newToken, error } = await supabase.functions.invoke('admin-update-profile', {
          body: { profile_id: editProfile.id, generate_portal_token: true },
        });
        // Fallback: insert directly via service (admin has no insert RLS on portal_tokens)
        // So we use a simple insert
        const { data: inserted, error: insertErr } = await supabase
          .from('user_portal_tokens')
          .insert({ user_id: editProfile.user_id })
          .select('token')
          .single();
        if (insertErr) throw insertErr;
        token = inserted.token;
      }

      const url = `${window.location.origin}/meu-espaco?t=${token}`;
      await navigator.clipboard.writeText(url);
      setPortalLinkCopied(true);
      toast({ title: 'Link copiado!', description: 'Link do portal copiado para a área de transferência.' });
      setTimeout(() => setPortalLinkCopied(false), 3000);
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message || 'Não foi possível gerar o link', variant: 'destructive' });
    } finally {
      setPortalLinkLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editProfile) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-update-profile', {
        body: {
          profile_id: editProfile.id,
          updates: {
            name: editForm.name || null,
            email: editForm.email || null,
            phone: editForm.phone || null,
            plan: editForm.plan,
            status: editForm.status,
            whatsapp_provider: editForm.whatsapp_provider === 'default' ? null : editForm.whatsapp_provider,
          },
        },
      });
      if (error) throw error;
      toast({ title: 'Perfil atualizado', description: `${editForm.name || 'Usuário'} foi atualizado com sucesso.` });
      setEditProfile(null);
      fetchProfiles();
    } catch (err: any) {
      toast({ title: 'Erro ao salvar', description: err.message || 'Erro desconhecido', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleResetSessions = async () => {
    if (!editProfile) return;
    setSaving(true);
    try {
      await supabase.functions.invoke('admin-update-profile', {
        body: {
          profile_id: editProfile.id,
          updates: { sessions_used_this_month: 0 },
        },
      });
      toast({ title: 'Sessões resetadas', description: 'Contador de sessões zerado.' });
      fetchProfiles();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // Cancela de verdade no gateway do cliente (Stripe / Asaas cartão / PIX Asaas /
  // PIX Automático Inter / PIX Automático Woovi). A edge function detecta o
  // trilho pelo profile e cancela a assinatura ou o mandato Bacen.
  const handleCancelGateway = async () => {
    if (!editProfile) return;
    const phoneClean = (editProfile.phone || '').replace(/\D/g, '');
    if (!phoneClean) {
      toast({
        title: 'Sem telefone',
        description: 'O cancelamento é resolvido pelo telefone do cliente. Preencha e salve antes.',
        variant: 'destructive',
      });
      return;
    }
    const ok = window.confirm(
      `Cancelar de verdade a assinatura de ${editProfile.name || 'este usuário'} no gateway?\n\n` +
        'Isso interrompe as próximas cobranças (ou cancela o mandato PIX). O acesso segue até o fim do período pago.',
    );
    if (!ok) return;
    setCancelingGateway(true);
    try {
      const { data, error } = await supabase.functions.invoke('cancel-subscription', {
        body: {
          phone: phoneClean,
          action: 'cancel',
          reason: 'other',
          reason_detail: 'Cancelamento manual pelo painel admin',
        },
      });
      if (error) throw error;
      if (data && data.success === false) {
        throw new Error(data.error || data.message || 'Gateway recusou o cancelamento');
      }
      toast({
        title: 'Cancelado no gateway',
        description: data?.message || 'Assinatura cancelada com sucesso.',
      });
      fetchProfiles();
    } catch (err: any) {
      toast({
        title: 'Erro ao cancelar',
        description: err?.context?.error || err?.message || 'Não foi possível cancelar agora.',
        variant: 'destructive',
      });
    } finally {
      setCancelingGateway(false);
    }
  };

  const handleRearmD0 = async () => {
    if (!editProfile) return;
    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke('admin-update-profile', {
        body: {
          profile_id: editProfile.id,
          updates: {
            pending_first_session_invite: true,
            first_session_invite_attempts: 0,
            needs_schedule_setup: false,
          },
        },
      });
      if (error) throw error;
      toast({ title: 'D0 rearmado', description: 'O convite à 1ª sessão será disparado na próxima mensagem.' });
      setEditProfile(null);
      fetchProfiles();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
  const fmtRelative = (d: string | null): string => {
    if (!d) return '—';
    const diffMs = Date.now() - new Date(d).getTime();
    const days = Math.floor(diffMs / 86_400_000);
    if (days === 0) return 'hoje';
    if (days === 1) return 'ontem';
    if (days < 7) return `há ${days}d`;
    if (days < 30) return `há ${Math.floor(days / 7)}sem`;
    return `há ${Math.floor(days / 30)}m`;
  };

  const openAbandonDetails = async (p: Profile) => {
    const stats = sessionStats[p.user_id];
    if (!stats || stats.abandonedList.length === 0) return;
    setAbandonProfile(p);
    setAbandonLoading(true);
    setAbandonDetails([]);
    try {
      // Para cada sessão abandonada, buscar a última mensagem do usuário no período
      const enriched = await Promise.all(stats.abandonedList.map(async (sess) => {
        const fromIso = sess.started_at!;
        const toIso = sess.ended_at
          || new Date(new Date(sess.scheduled_at).getTime() + (sess.duration_minutes || 45) * 60_000 + 30 * 60_000).toISOString();
        const { data } = await supabase
          .from('messages')
          .select('content, created_at')
          .eq('user_id', p.user_id)
          .eq('role', 'user')
          .gte('created_at', fromIso)
          .lte('created_at', toIso)
          .order('created_at', { ascending: false })
          .limit(1);
        const last = (data || [])[0] as any;
        return {
          ...sess,
          lastUserMessage: last?.content as string | undefined,
          lastUserMessageAt: last?.created_at as string | undefined,
        };
      }));
      setAbandonDetails(enriched);
    } finally {
      setAbandonLoading(false);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (authLoading || !isAdmin) return <div className="flex items-center justify-center min-h-screen text-muted-foreground">Carregando...</div>;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/engajamento')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold text-foreground">Gestão de Usuários</h1>
        <span className="text-sm text-muted-foreground">({total} usuários)</span>
      </div>

      {/* Search */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, telefone ou email..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-10"
          />
        </div>
        <Select value={periodFilter} onValueChange={(v: any) => { setPeriodFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Período" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos períodos</SelectItem>
            <SelectItem value="today">Hoje</SelectItem>
            <SelectItem value="7d">Últimos 7 dias</SelectItem>
            <SelectItem value="30d">Últimos 30 dias</SelectItem>
          </SelectContent>
        </Select>
        <Select value={d0Filter} onValueChange={(v: any) => { setD0Filter(v); setPage(0); }}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status D0" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">D0: Todos</SelectItem>
            <SelectItem value="pendente">D0: Pendente</SelectItem>
            <SelectItem value="tentando">D0: Tentando</SelectItem>
            <SelectItem value="recusado">D0: Recusou→Setup</SelectItem>
            <SelectItem value="agendado">D0: Agendado</SelectItem>
            <SelectItem value="concluido">D0: Fez 1ª sessão</SelectItem>
            <SelectItem value="sem_dados">D0: Sem dados</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sessionFilter} onValueChange={(v: any) => { setSessionFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[220px]"><SelectValue placeholder="Sessões" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Sessões: Todas</SelectItem>
            <SelectItem value="with_abandoned">Com sessão abandonada</SelectItem>
            <SelectItem value="with_noshow">Com no-show</SelectItem>
            <SelectItem value="done_without_rating">Concluída sem rating</SelectItem>
            <SelectItem value="low_rating">Rating médio ≤ 3</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortFilter} onValueChange={(v: any) => { setSortFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Ordenar por" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Mais novos</SelectItem>
            <SelectItem value="oldest">Mais antigos</SelectItem>
            <SelectItem value="last_contact">Último contato</SelectItem>
            <SelectItem value="highest_rating">Maior rating</SelectItem>
            <SelectItem value="lowest_rating">Menor rating</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="border rounded-lg bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Sessões</TableHead>
              <TableHead>Última sessão</TableHead>
              <TableHead>D0</TableHead>
              <TableHead>Rating médio</TableHead>
              <TableHead>Criado em</TableHead>
              <TableHead>Último contato</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : profiles.length === 0 ? (
              <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Nenhum usuário encontrado</TableCell></TableRow>
            ) : profiles.map((p) => {
              const s = sessionStats[p.user_id];
              const d0 = getD0Status(p, s);
              const attempts = p.first_session_invite_attempts ?? 0;
              const r = ratings[p.user_id];
              const done = s?.done ?? 0;
              const abandoned = s?.abandoned ?? 0;
              const noshow = s?.noshow ?? 0;
              const upcoming = s?.upcoming ?? 0;
              const doneWithoutRating = done > 0 && !r;
              return (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.name || '(sem nome)'}</TableCell>
                <TableCell className="text-sm">{p.phone || '—'}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={planColors[p.plan || ''] || 'bg-muted'}>
                    {p.plan || '—'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={statusColors[p.status || ''] || 'bg-muted'}>
                    {p.status || '—'}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs">
                      <span className="text-green-700 font-semibold">{done}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className={abandoned > 0 ? 'text-amber-700 font-semibold' : 'text-muted-foreground'}>{abandoned}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className={noshow >= 2 ? 'text-red-700 font-semibold' : 'text-muted-foreground'}>{noshow}</span>
                      <span className="text-muted-foreground"> / {upcoming}</span>
                    </span>
                    {abandoned > 0 && (
                      <button
                        type="button"
                        onClick={() => openAbandonDetails(p)}
                        className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 hover:bg-amber-100"
                        title="Ver sessões abandonadas"
                      >
                        <AlertTriangle className="h-3 w-3" /> {abandoned}
                      </button>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    feitas · abandono · no-show / agendadas
                  </div>
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap">
                  {s?.lastCompletedAt ? (
                    <span className="inline-flex items-center gap-1">
                      <Check className="h-3 w-3 text-green-600" />
                      {fmtRelative(s.lastCompletedAt)}
                    </span>
                  ) : s?.lastAbandonedAt ? (
                    <span className="inline-flex items-center gap-1 text-amber-700">
                      <AlertTriangle className="h-3 w-3" />
                      {fmtRelative(s.lastAbandonedAt)}
                    </span>
                  ) : '—'}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={d0Colors[d0]}>
                    {d0Labels[d0]}{d0 === 'tentando' ? ` ${attempts}x` : ''}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap">
                  {r ? (
                    <span className="inline-flex items-center gap-1">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      <span className={r.avg <= 3 ? 'text-red-700 font-semibold' : ''}>{r.avg.toFixed(1)}</span>
                      <span className="text-muted-foreground">({r.count}/{done || '–'})</span>
                    </span>
                  ) : doneWithoutRating ? (
                    <span className="inline-flex items-center gap-1 text-amber-700" title="Sessão concluída sem rating capturado">
                      <AlertTriangle className="h-3.5 w-3.5" /> sem captura (0/{done})
                    </span>
                  ) : '—'}
                </TableCell>
                <TableCell className="text-sm">{fmt(p.created_at)}</TableCell>
                <TableCell className="text-sm">{fmt(p.last_user_message_at)}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-muted-foreground">Página {page + 1} de {totalPages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editProfile} onOpenChange={(open) => !open && setEditProfile(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
          </DialogHeader>
          {editProfile && (
            <div className="space-y-4">
              <div className="text-xs text-muted-foreground space-y-1">
                <p>ID: {editProfile.user_id}</p>
                <p>Criado em: {fmt(editProfile.created_at)}</p>
                <p>Episódio atual: {editProfile.current_episode ?? 0} | Jornada: {editProfile.current_journey_id || '—'}</p>
                <p>Sessões usadas: {editProfile.sessions_used_this_month ?? 0}</p>
                <p>Fase trial: {editProfile.trial_phase || '—'}</p>
                <p>
                  D0: <span className="font-medium text-foreground">{d0Labels[getD0Status(editProfile, sessionStats[editProfile.user_id])]}</span>
                  {' '}· tentativas: {editProfile.first_session_invite_attempts ?? 0}
                  {' '}· pending: {String(editProfile.pending_first_session_invite ?? false)}
                  {' '}· setup: {String(editProfile.needs_schedule_setup ?? false)}
                </p>
                <p>
                  Rating médio: {ratings[editProfile.user_id]
                    ? `${ratings[editProfile.user_id].avg.toFixed(2)} ⭐ em ${ratings[editProfile.user_id].count} sessões`
                    : '—'}
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-foreground">Nome</label>
                  <Input value={editForm.name} onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Email</label>
                  <Input value={editForm.email} onChange={(e) => setEditForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Telefone</label>
                  <Input value={editForm.phone} onChange={(e) => setEditForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Plano</label>
                  <Select value={editForm.plan} onValueChange={(v) => setEditForm(f => ({ ...f, plan: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="trial">Trial</SelectItem>
                      <SelectItem value="essencial">Essencial</SelectItem>
                      <SelectItem value="direcao">Direção</SelectItem>
                      <SelectItem value="transformacao">Transformação</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Status</label>
                  <Select value={editForm.status} onValueChange={(v) => setEditForm(f => ({ ...f, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="paused">Paused</SelectItem>
                      <SelectItem value="canceled">Canceled</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="trial">Trial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Canal WhatsApp</label>
                  <Select value={editForm.whatsapp_provider} onValueChange={(v) => setEditForm(f => ({ ...f, whatsapp_provider: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Default (config global)</SelectItem>
                      <SelectItem value="meta">Meta Cloud API direta (novo nº)</SelectItem>
                      <SelectItem value="official">Twilio (oficial atual)</SelectItem>
                      <SelectItem value="zapi">Z-API (legado)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Override por usuário. "Default" usa o canal global em system_config.
                  </p>
                </div>
              </div>

              <Button variant="outline" size="sm" className="w-full" onClick={handleResetSessions} disabled={saving}>
                <RotateCcw className="h-4 w-4 mr-2" /> Resetar sessões do mês
              </Button>

              {getD0Status(editProfile, sessionStats[editProfile.user_id]) !== 'pendente' && (editProfile.first_session_invite_attempts ?? 0) < 3 && (
                <Button variant="outline" size="sm" className="w-full" onClick={handleRearmD0} disabled={saving}>
                  <RefreshCw className="h-4 w-4 mr-2" /> Rearmar convite D0
                </Button>
              )}

              <Button variant="outline" size="sm" className="w-full" onClick={handleCopyPortalLink} disabled={portalLinkLoading}>
                {portalLinkCopied ? <Check className="h-4 w-4 mr-2 text-green-600" /> : <Link className="h-4 w-4 mr-2" />}
                {portalLinkLoading ? 'Gerando...' : portalLinkCopied ? 'Link copiado!' : 'Copiar link do Meu Espaço'}
              </Button>

              <div className="border-t pt-3 space-y-1">
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full"
                  onClick={handleCancelGateway}
                  disabled={cancelingGateway}
                >
                  <Ban className="h-4 w-4 mr-2" />
                  {cancelingGateway ? 'Cancelando no gateway...' : 'Cancelar assinatura de verdade'}
                </Button>
                <p className="text-[10px] text-muted-foreground">
                  Mudar o campo Status acima é só rótulo interno — não para cobranças.
                  Este botão cancela no gateway real do cliente (Stripe, Asaas cartão/PIX,
                  PIX Automático Inter ou Woovi).
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditProfile(null)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Abandono drill-down */}
      <Dialog open={!!abandonProfile} onOpenChange={(open) => !open && setAbandonProfile(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Sessões abandonadas — {abandonProfile?.name || '(sem nome)'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {abandonLoading ? (
              <p className="text-sm text-muted-foreground text-center py-6">Carregando detalhes…</p>
            ) : abandonDetails.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Sem detalhes disponíveis.</p>
            ) : abandonDetails.map((d) => (
              <div key={d.id} className="border rounded-lg p-3 bg-card space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Agendada: {new Date(d.scheduled_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span>
                  <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">
                    <AlertTriangle className="h-3 w-3 mr-1" /> abandonada
                  </Badge>
                </div>
                <div className="text-xs space-y-0.5">
                  <p>
                    <span className="text-muted-foreground">Iniciou:</span>{' '}
                    {d.started_at ? new Date(d.started_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Duração planejada:</span> {d.duration_minutes ?? 45} min
                  </p>
                  {d.focus_topic && (
                    <p>
                      <span className="text-muted-foreground">Foco:</span> {d.focus_topic}
                    </p>
                  )}
                </div>
                {d.lastUserMessage ? (
                  <div className="bg-muted/50 rounded-md p-2 border border-border/40">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                      Última mensagem do usuário antes de sumir
                      {d.lastUserMessageAt && (
                        <span className="normal-case ml-1">
                          ({new Date(d.lastUserMessageAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })})
                        </span>
                      )}
                    </p>
                    <p className="text-xs italic">"{d.lastUserMessage.slice(0, 280)}{d.lastUserMessage.length > 280 ? '…' : ''}"</p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">Sem mensagens do usuário no período da sessão.</p>
                )}
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (!abandonProfile) return;
                      navigate(`/admin/mensagens?userId=${abandonProfile.user_id}`);
                    }}
                  >
                    <MessageSquare className="h-3 w-3 mr-1.5" /> Ver conversa
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbandonProfile(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
