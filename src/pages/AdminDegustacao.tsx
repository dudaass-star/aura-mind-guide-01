import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import { RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

/**
 * Indicadores da degustação: funil, conversão por desfecho do encontro,
 * receita, janela de conversão e safras diárias. Leads = perfis com
 * degustacao_started_at; conversão = degustacao_converted_at.
 */

const PRICE: Record<string, number> = { essencial: 29.9, direcao: 49.9, transformacao: 79.9 };
const BRT = 3 * 3600e3;
const brtDay = (iso: string) => new Date(new Date(iso).getTime() - BRT).toISOString().slice(0, 10);
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const planKey = (p?: string | null) => (p || '').toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');

type Outcome = 'sem_inicio' | 'em_andamento' | 'interrompido' | 'concluido';
type Lead = {
  id: string; name: string; phone: string | null; email: string | null; createdAt: string;
  status: string; plan: string | null; convertedAt: string | null; sessions: number; restarted: boolean;
  outcome: Outcome; minutes: number; userMsgs: number; prayer: boolean; meditation: boolean;
  checkout: boolean; method: 'PIX' | 'Cartão' | null; value: number;
};

const chunk = <T,>(arr: T[], n = 150) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

async function load(from: string, to: string) {
  const start = new Date(`${from}T03:00:00Z`).toISOString();
  const end = new Date(new Date(`${to}T03:00:00Z`).getTime() + 864e5).toISOString();
  const { data: profiles, error } = await supabase.from('profiles')
    .select('id,user_id,name,phone,email,status,plan,degustacao_started_at,degustacao_converted_at,degustacao_prayer_id,degustacao_meditation_id')
    .not('degustacao_started_at', 'is', null).gte('degustacao_started_at', start).lt('degustacao_started_at', end)
    .order('degustacao_started_at', { ascending: false }).limit(1000);
  if (error) throw error;
  const ps = (profiles || []).filter((p: any) => p.status !== 'demo');
  const uids = ps.map((p: any) => p.user_id).filter(Boolean);
  const phones = ps.map((p: any) => p.phone).filter(Boolean);
  const emails = ps.map((p: any) => p.email).filter(Boolean);
  const sessions: any[] = []; const msgs: any[] = []; const charges: any[] = []; const checkouts: any[] = [];
  await Promise.all([
    ...chunk(uids).map(async ids => { const { data } = await supabase.from('sessions').select('user_id,status,closure_mode,started_at,ended_at,quota_exempt').in('user_id', ids).eq('quota_exempt', true); sessions.push(...(data || [])); }),
    ...chunk(uids).map(async ids => { const { data } = await supabase.from('messages').select('user_id,created_at').in('user_id', ids).eq('role', 'user').gte('created_at', start).limit(5000); msgs.push(...(data || [])); }),
    ...chunk(uids).map(async ids => { const { data } = await supabase.from('woovi_charges').select('user_id,status,paid_at').in('user_id', ids); charges.push(...(data || [])); }),
    ...chunk(phones).map(async v => { const { data } = await supabase.from('checkout_sessions').select('phone,email').in('phone', v).gte('created_at', start); checkouts.push(...(data || [])); }),
    ...chunk(emails).map(async v => { const { data } = await supabase.from('checkout_sessions').select('phone,email').in('email', v).gte('created_at', start); checkouts.push(...(data || [])); }),
  ]);
  const ckPhones = new Set(checkouts.map(c => c.phone)); const ckEmails = new Set(checkouts.map(c => c.email));
  return ps.map((p: any): Lead => {
    const ss = sessions.filter(s => s.user_id === p.user_id);
    const started = ss.filter(s => s.started_at);
    const done = ss.find(s => s.status === 'completed' && s.closure_mode !== 'unilateral');
    const live = ss.find(s => s.status === 'in_progress');
    const interrupted = started.some(s => s.closure_mode === 'unilateral' || s.status === 'no_show');
    const outcome: Outcome = done ? 'concluido' : live ? 'em_andamento' : interrupted || started.length ? 'interrompido' : 'sem_inicio';
    const minutes = Math.max(0, ...started.map(s => s.ended_at ? (Date.parse(s.ended_at) - Date.parse(s.started_at)) / 6e4 : 0));
    const converted = !!p.degustacao_converted_at || p.status === 'active';
    const paidPix = charges.some(c => c.user_id === p.user_id && (c.paid_at || c.status === 'COMPLETED'));
    return {
      id: p.id, name: p.name || 'Sem nome', phone: p.phone, email: p.email, createdAt: p.degustacao_started_at,
      status: p.status, plan: converted ? p.plan : null, convertedAt: converted ? (p.degustacao_converted_at || null) : null,
      sessions: started.length, restarted: started.length > 1, outcome, minutes: Math.round(minutes),
      userMsgs: msgs.filter(m => m.user_id === p.user_id).length,
      prayer: !!p.degustacao_prayer_id, meditation: !!p.degustacao_meditation_id,
      checkout: converted || (p.phone && ckPhones.has(p.phone)) || (p.email && ckEmails.has(p.email)),
      method: converted ? (paidPix ? 'PIX' : 'Cartão') : null,
      value: converted ? PRICE[planKey(p.plan)] || 0 : 0,
    };
  });
}

const OUTCOME_LABEL: Record<Outcome, string> = { sem_inicio: 'Não iniciou', em_andamento: 'Em andamento', interrompido: 'Interrompido', concluido: 'Concluído' };

function Stat({ label, value, detail }: { label: string; value: React.ReactNode; detail?: string }) {
  return <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-semibold mt-1">{value}</p>{detail && <p className="text-xs text-muted-foreground mt-1">{detail}</p>}</CardContent></Card>;
}

export default function AdminDegustacao() {
  const { isLoading, isAdmin } = useAdminAuth();
  const today = format(new Date(Date.now() - BRT), 'yyyy-MM-dd');
  const [range, setRange] = useState({ from: format(subDays(new Date(Date.now() - BRT), 29), 'yyyy-MM-dd'), to: today });
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const q = useQuery({ queryKey: ['admin-degustacao', range], queryFn: () => load(range.from, range.to), enabled: isAdmin, staleTime: 120_000 });
  const leads = q.data || [];

  const m = useMemo(() => {
    const started = leads.filter(l => l.sessions > 0);
    const engaged = leads.filter(l => l.userMsgs >= 4);
    const done = leads.filter(l => l.outcome === 'concluido');
    const interrupted = leads.filter(l => l.outcome === 'interrompido');
    const noStart = leads.filter(l => l.outcome === 'sem_inicio');
    const restarted = leads.filter(l => l.restarted);
    const checkout = leads.filter(l => l.checkout);
    const conv = leads.filter(l => l.plan);
    const conv_ = (g: Lead[]) => g.filter(l => l.plan).length;
    const hours = conv.filter(l => l.convertedAt).map(l => (Date.parse(l.convertedAt!) - Date.parse(l.createdAt)) / 36e5);
    const win = { d0: hours.filter(h => h < 24).length, d1_3: hours.filter(h => h >= 24 && h < 96).length, late: hours.filter(h => h >= 96).length };
    const mrr = conv.reduce((s, l) => s + l.value, 0);
    const plans = ['essencial', 'direcao', 'transformacao'].map(k => ({ k, n: conv.filter(l => planKey(l.plan) === k).length }));
    const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
    const cohorts = new Map<string, { leads: number; started: number; done: number; conv: number }>();
    for (const l of leads) {
      const k = brtDay(l.createdAt); const c = cohorts.get(k) || { leads: 0, started: 0, done: 0, conv: 0 };
      c.leads++; if (l.sessions) c.started++; if (l.outcome === 'concluido') c.done++; if (l.plan) c.conv++; cohorts.set(k, c);
    }
    return {
      started, engaged, done, interrupted, noStart, restarted, checkout, conv, conv_, win, mrr, plans,
      prayer: leads.filter(l => l.prayer || l.meditation).length,
      avgMin: avg(started.map(l => l.minutes)), avgMsgs: avg(started.map(l => l.userMsgs)),
      avgHours: hours.length ? Math.round(avg(hours)) : null,
      pix: conv.filter(l => l.method === 'PIX').length, card: conv.filter(l => l.method === 'Cartão').length,
      cohorts: [...cohorts.entries()].sort((a, b) => b[0].localeCompare(a[0])),
    };
  }, [leads]);

  const status = (l: Lead) => l.plan ? 'Convertido' : l.checkout ? 'No checkout' : OUTCOME_LABEL[l.outcome];
  const list = leads.filter(l => (filter === 'all' || status(l) === filter) && (!search || `${l.name} ${l.phone} ${l.email}`.toLowerCase().includes(search.toLowerCase())));

  if (isLoading) return <Skeleton className="h-40 w-full m-6" />;
  if (!isAdmin) return <p className="p-6 text-sm text-muted-foreground">Acesso restrito.</p>;

  const funnel = [
    ['Leads', leads.length, ''], ['Iniciaram encontro', m.started.length, pct(m.started.length, leads.length)],
    ['Engajaram (4+ msgs)', m.engaged.length, pct(m.engaged.length, leads.length)],
    ['Concluíram com despedida', m.done.length, pct(m.done.length, m.started.length) + ' dos que iniciaram'],
    ['Abriram checkout', m.checkout.length, pct(m.checkout.length, m.done.length || leads.length)],
    ['Pagaram', m.conv.length, pct(m.conv.length, m.checkout.length) + ' do checkout'],
  ] as const;

  return <div className="space-y-6 p-4 md:p-6">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">Degustação</h1><p className="text-sm text-muted-foreground">Leads pela data do cadastro · horário de Brasília · contas demo excluídas</p></div>
      <div className="flex flex-wrap items-end gap-2">
        <Input type="date" value={range.from} max={range.to} onChange={e => setRange(r => ({ ...r, from: e.target.value }))} className="w-[150px]" aria-label="De" />
        <Input type="date" value={range.to} min={range.from} max={today} onChange={e => setRange(r => ({ ...r, to: e.target.value }))} className="w-[150px]" aria-label="Até" />
        <Button variant="outline" size="icon" onClick={() => q.refetch()} aria-label="Atualizar"><RefreshCw className={`h-4 w-4 ${q.isFetching ? 'animate-spin' : ''}`} /></Button>
      </div>
    </div>

    {q.isLoading ? <Skeleton className="h-64 w-full" /> : q.error ? <p className="text-sm text-destructive">Não foi possível carregar os dados.</p> : <>
      <div className="grid gap-3 grid-cols-2 md:grid-cols-6">{funnel.map(([l, v, d]) => <Stat key={l} label={l} value={v} detail={d} />)}</div>
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Stat label="Conversão global" value={pct(m.conv.length, leads.length)} detail="Leads → pagos" />
        <Stat label="MRR gerado" value={brl(m.mrr)} detail={`Ticket médio ${m.conv.length ? brl(m.mrr / m.conv.length) : '—'}`} />
        <Stat label="Tempo médio de encontro" value={`${m.avgMin} min`} detail={`${m.avgMsgs} mensagens do lead em média`} />
        <Stat label="Tempo até pagar" value={m.avgHours === null ? '—' : `${m.avgHours} h`} detail="Cadastro → pagamento" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card><CardHeader><CardTitle className="text-base">Conversão por desfecho do encontro</CardTitle></CardHeader><CardContent>
          <Table><TableHeader><TableRow><TableHead>Desfecho</TableHead><TableHead className="text-right">Leads</TableHead><TableHead className="text-right">Pagos</TableHead><TableHead className="text-right">Taxa</TableHead></TableRow></TableHeader><TableBody>
            {([['Concluíram com despedida', m.done], ['Interrompidos', m.interrupted], ['Recomeçaram', m.restarted], ['Não iniciaram', m.noStart]] as const).map(([l, g]) =>
              <TableRow key={l}><TableCell>{l}</TableCell><TableCell className="text-right">{g.length}</TableCell><TableCell className="text-right">{m.conv_(g)}</TableCell><TableCell className="text-right font-medium">{pct(m.conv_(g), g.length)}</TableCell></TableRow>)}
          </TableBody></Table>
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Pagamentos e janela de conversão</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-2">{m.plans.map(p => <Badge key={p.k} variant="outline" className="capitalize">{p.k === 'direcao' ? 'Direção' : p.k}: {p.n}</Badge>)}</div>
          <div className="flex flex-wrap gap-2"><Badge variant="secondary">PIX Automático: {m.pix}</Badge><Badge variant="secondary">Cartão: {m.card}</Badge></div>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Mesmo dia" value={m.win.d0} /><Stat label="1 a 3 dias" value={m.win.d1_3} /><Stat label="Depois" value={m.win.late} />
          </div>
          <p className="text-muted-foreground">Gargalo: {m.checkout.length - m.conv.length} abriram o checkout sem pagar · {m.prayer} usaram oração ou meditação.</p>
        </CardContent></Card>
      </div>

      <Card><CardHeader><CardTitle className="text-base">Safras diárias</CardTitle></CardHeader><CardContent className="overflow-x-auto">
        <Table><TableHeader><TableRow><TableHead>Dia</TableHead><TableHead className="text-right">Leads</TableHead><TableHead className="text-right">Iniciaram</TableHead><TableHead className="text-right">Concluíram</TableHead><TableHead className="text-right">Pagos</TableHead><TableHead className="text-right">Conversão</TableHead></TableRow></TableHeader><TableBody>
          {m.cohorts.map(([d, c]) => <TableRow key={d}><TableCell>{d.slice(8)}/{d.slice(5, 7)}</TableCell><TableCell className="text-right">{c.leads}</TableCell><TableCell className="text-right">{c.started}</TableCell><TableCell className="text-right">{c.done}</TableCell><TableCell className="text-right">{c.conv}</TableCell><TableCell className="text-right font-medium">{pct(c.conv, c.leads)}</TableCell></TableRow>)}
        </TableBody></Table>
      </CardContent></Card>

      <Card><CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2"><CardTitle className="text-base">Leads ({list.length})</CardTitle>
        <div className="flex gap-2"><Input placeholder="Buscar nome, telefone ou e-mail" value={search} onChange={e => setSearch(e.target.value)} className="w-[230px]" />
          <Select value={filter} onValueChange={setFilter}><SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger><SelectContent>
            {['all', 'Não iniciou', 'Em andamento', 'Interrompido', 'Concluído', 'No checkout', 'Convertido'].map(s => <SelectItem key={s} value={s}>{s === 'all' ? 'Todos' : s}</SelectItem>)}
          </SelectContent></Select></div>
      </CardHeader><CardContent className="overflow-x-auto">
        <Table><TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Cadastro</TableHead><TableHead>Situação</TableHead><TableHead className="text-right">Msgs</TableHead><TableHead className="text-right">Min</TableHead><TableHead>Práticas</TableHead><TableHead>Plano</TableHead></TableRow></TableHeader><TableBody>
          {list.map(l => <TableRow key={l.id}>
            <TableCell><div className="font-medium">{l.name}</div><div className="text-xs text-muted-foreground">{l.phone || 'Sem telefone'}</div></TableCell>
            <TableCell className="whitespace-nowrap">{format(new Date(l.createdAt), 'dd/MM HH:mm')}</TableCell>
            <TableCell><Badge variant={l.plan ? 'default' : l.outcome === 'interrompido' ? 'destructive' : 'outline'}>{status(l)}</Badge>{l.restarted && <Badge variant="secondary" className="ml-1">Recomeçou</Badge>}</TableCell>
            <TableCell className="text-right">{l.userMsgs}</TableCell><TableCell className="text-right">{l.minutes || '—'}</TableCell>
            <TableCell className="text-xs">{[l.prayer && 'Oração', l.meditation && 'Meditação'].filter(Boolean).join(' · ') || '—'}</TableCell>
            <TableCell className="text-xs capitalize">{l.plan ? `${l.plan} · ${l.method}` : '—'}</TableCell>
          </TableRow>)}
        </TableBody></Table>
      </CardContent></Card>
    </>}
  </div>;
}
