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
import { ArrowLeft, Search, Pencil, RotateCcw, ChevronLeft, ChevronRight, Link, Copy, Check, Star, RefreshCw, AlertTriangle, MessageSquare } from 'lucide-react';

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

type D0Status = 'pendente' | 'tentando' | 'recusado' | 'concluido';

function getD0Status(p: Profile): D0Status {
  const pending = p.pending_first_session_invite;
  const attempts = p.first_session_invite_attempts ?? 0;
  const needsSetup = p.needs_schedule_setup;
  if (pending && attempts === 0) return 'pendente';
  if (pending && attempts >= 1) return 'tentando';
  if (!pending && needsSetup) return 'recusado';
  return 'concluido';
}

const d0Labels: Record<D0Status, string> = {
  pendente: 'Pendente',
  tentando: 'Tentando',
  recusado: 'Recusou→Setup',
  concluido: 'Concluído',
};

const d0Colors: Record<D0Status, string> = {
  pendente: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  tentando: 'bg-blue-100 text-blue-800 border-blue-200',
  recusado: 'bg-orange-100 text-orange-800 border-orange-200',
  concluido: 'bg-green-100 text-green-800 border-green-200',
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
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', plan: '', status: '' });
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
  }, [isAdmin, page, search, periodFilter, d0Filter, sortFilter]);

  const fetchProfiles = async () => {
    setLoading(true);
    let query = supabase
      .from('profiles')
      .select('id, user_id, name, phone, email, plan, status, created_at, last_user_message_at, current_episode, current_journey_id, sessions_used_this_month, trial_phase, pending_first_session_invite, first_session_invite_attempts, needs_schedule_setup', { count: 'exact' })
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
    } else if (d0Filter === 'concluido') {
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

  const openEdit = (p: Profile) => {
    setEditProfile(p);
    setPortalLinkCopied(false);
    setEditForm({
      name: p.name || '',
      email: p.email || '',
      phone: p.phone || '',
      plan: p.plan || 'essencial',
      status: p.status || 'active',
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
            <SelectItem value="concluido">D0: Concluído</SelectItem>
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
              <TableHead>D0</TableHead>
              <TableHead>Rating</TableHead>
              <TableHead>Criado em</TableHead>
              <TableHead>Último contato</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : profiles.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Nenhum usuário encontrado</TableCell></TableRow>
            ) : profiles.map((p) => {
              const d0 = getD0Status(p);
              const attempts = p.first_session_invite_attempts ?? 0;
              const r = ratings[p.user_id];
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
                <TableCell>
                  <Badge variant="outline" className={d0Colors[d0]}>
                    {d0Labels[d0]}{d0 === 'tentando' ? ` ${attempts}x` : ''}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap">
                  {r ? (
                    <span className="inline-flex items-center gap-1">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      {r.avg.toFixed(1)}
                      <span className="text-muted-foreground">({r.count})</span>
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
                  D0: <span className="font-medium text-foreground">{d0Labels[getD0Status(editProfile)]}</span>
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
              </div>

              <Button variant="outline" size="sm" className="w-full" onClick={handleResetSessions} disabled={saving}>
                <RotateCcw className="h-4 w-4 mr-2" /> Resetar sessões do mês
              </Button>

              {getD0Status(editProfile) !== 'pendente' && (editProfile.first_session_invite_attempts ?? 0) < 3 && (
                <Button variant="outline" size="sm" className="w-full" onClick={handleRearmD0} disabled={saving}>
                  <RefreshCw className="h-4 w-4 mr-2" /> Rearmar convite D0
                </Button>
              )}

              <Button variant="outline" size="sm" className="w-full" onClick={handleCopyPortalLink} disabled={portalLinkLoading}>
                {portalLinkCopied ? <Check className="h-4 w-4 mr-2 text-green-600" /> : <Link className="h-4 w-4 mr-2" />}
                {portalLinkLoading ? 'Gerando...' : portalLinkCopied ? 'Link copiado!' : 'Copiar link do Meu Espaço'}
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditProfile(null)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
