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
import { ArrowLeft, Search, Pencil, RotateCcw, ChevronLeft, ChevronRight, Link, Copy, Check } from 'lucide-react';

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

export default function AdminUsers() {
  const { isLoading: authLoading, isAdmin, redirectIfNotAdmin } = useAdminAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  // Edit dialog
  const [editProfile, setEditProfile] = useState<Profile | null>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', plan: '', status: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authLoading) redirectIfNotAdmin();
  }, [authLoading, isAdmin]);

  useEffect(() => {
    if (isAdmin) fetchProfiles();
  }, [isAdmin, page, search]);

  const fetchProfiles = async () => {
    setLoading(true);
    let query = supabase
      .from('profiles')
      .select('id, user_id, name, phone, email, plan, status, created_at, last_user_message_at, current_episode, current_journey_id, sessions_used_this_month, trial_phase', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (search.trim()) {
      query = query.or(`name.ilike.%${search.trim()}%,phone.ilike.%${search.trim()}%,email.ilike.%${search.trim()}%`);
    }

    const { data, count, error } = await query;
    if (error) {
      console.error('Error fetching profiles:', error);
    } else {
      setProfiles(data || []);
      setTotal(count || 0);
    }
    setLoading(false);
  };

  const openEdit = (p: Profile) => {
    setEditProfile(p);
    setEditForm({
      name: p.name || '',
      email: p.email || '',
      phone: p.phone || '',
      plan: p.plan || 'essencial',
      status: p.status || 'active',
    });
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
      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, telefone ou email..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className="pl-10"
        />
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
              <TableHead>Criado em</TableHead>
              <TableHead>Último contato</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : profiles.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum usuário encontrado</TableCell></TableRow>
            ) : profiles.map((p) => (
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
                <TableCell className="text-sm">{fmt(p.created_at)}</TableCell>
                <TableCell className="text-sm">{fmt(p.last_user_message_at)}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
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
