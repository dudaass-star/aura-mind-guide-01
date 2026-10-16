import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import { RefreshCw, Users, PlayCircle, MessageCircle, CheckCircle2, ShoppingCart, BadgeDollarSign, TrendingUp, Clock, Wallet } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, PieChart, Pie, ComposedChart, Line, LabelList,
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

/**
 * Indicadores da degustação. Dados calculados no backend administrativo
 * (admin-degustacao-metrics), pois mensagens e checkouts têm RLS por usuário.
 */

const BRT = 3 * 3600e3;
const brtDay = (iso: string) => new Date(new Date(iso).getTime() - BRT).toISOString().slice(0, 10);
const pctN = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const pct = (a: number, b: number) => (b ? `${pctN(a, b)}%` : '—');
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const planKey = (p?: string | null) => (p || '').toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
const PLAN_LABEL: Record<string, string> = { essencial: 'Essencial', direcao: 'Direção', transformacao: 'Transformação' };
const C = (n: number) => `hsl(var(--chart-${n}))`;

type Outcome = 'sem_inicio' | 'em_andamento' | 'interrompido' | 'concluido';
type Lead = {
  id: string; name: string; phone: string | null; email: string | null; createdAt: string;
  status: string; plan: string | null; convertedAt: string | null; sessions: number; restarted: boolean;
  outcome: Outcome; minutes: number; userMsgs: number; prayer: boolean; meditation: boolean;
  checkout: boolean; method: 'PIX' | 'Cartão' | null; value: number;
};
type Payload = { leads: Lead[]; directSales: { day: string; plan: string; value: number }[] };

async function load(from: string, to: string): Promise<Payload> {
  const { data, error } = await supabase.functions.invoke('admin-degustacao-metrics', { body: { from, to } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

const OUTCOME_LABEL: Record<Outcome, string> = { sem_inicio: 'Não iniciou', em_andamento: 'Em andamento', interrompido: 'Interrompido', concluido: 'Concluído' };

const tooltipStyle = { background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 10, fontSize: 12, color: 'hsl(var(--popover-foreground))' };

function Kpi({ icon: Icon, label, value, detail, tone = 1 }: { icon: any; label: string; value: React.ReactNode; detail?: string; tone?: number }) {
  return <Card className="relative overflow-hidden">
    <CardContent className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <span className="rounded-lg p-1.5" style={{ background: `hsl(var(--chart-${tone}) / 0.12)`, color: C(tone) }}><Icon className="h-4 w-4" /></span>
      </div>
      <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
    </CardContent>
  </Card>;
}

export default function AdminDegustacao() {
  const { isLoading, isAdmin } = useAdminAuth();
  const today = format(new Date(Date.now() - BRT), 'yyyy-MM-dd');
  const [range, setRange] = useState({ from: format(subDays(new Date(Date.now() - BRT), 29), 'yyyy-MM-dd'), to: today });
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const q = useQuery({ queryKey: ['admin-degustacao', range], queryFn: () => load(range.from, range.to), enabled: isAdmin, staleTime: 120_000 });
  const leads = q.data?.leads || [];
  const direct = q.data?.directSales || [];

  const m = useMemo(() => {
    const started = leads.filter(l => l.sessions > 0);
    const engaged = leads.filter(l => l.userMsgs >= 4);
    const done = leads.filter(l => l.outcome === 'concluido');
    const live = leads.filter(l => l.outcome === 'em_andamento');
    const interrupted = leads.filter(l => l.outcome === 'interrompido');
    const noStart = leads.filter(l => l.outcome === 'sem_inicio');
    const restarted = leads.filter(l => l.restarted);
    const checkout = leads.filter(l => l.checkout);
    const conv = leads.filter(l => l.plan);
    const convOf = (g: Lead[]) => g.filter(l => l.plan).length;
    const hours = conv.filter(l => l.convertedAt).map(l => (Date.parse(l.convertedAt!) - Date.parse(l.createdAt)) / 36e5);
    const mrr = conv.reduce((s, l) => s + l.value, 0);
    const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
    const days = new Map<string, { day: string; leads: number; started: number; done: number; conv: number }>();
    for (const l of leads) {
      const k = brtDay(l.createdAt); const c = days.get(k) || { day: k, leads: 0, started: 0, done: 0, conv: 0 };
      c.leads++; if (l.sessions) c.started++; if (l.outcome === 'concluido') c.done++; if (l.plan) c.conv++; days.set(k, c);
    }
    const cohorts = [...days.values()].sort((a, b) => a.day.localeCompare(b.day)).map(c => ({ ...c, label: c.day.slice(8, 10) + '/' + c.day.slice(5, 7), taxa: pctN(c.conv, c.leads) }));
    return {
      started, engaged, done, live, interrupted, noStart, restarted, checkout, conv, convOf, mrr, cohorts,
      practice: leads.filter(l => l.prayer || l.meditation).length,
      avgMin: avg(started.map(l => l.minutes)), avgMsgs: avg(started.map(l => l.userMsgs)),
      avgHours: hours.length ? avg(hours) : null,
      window: [
        { name: 'Mesmo dia', n: hours.filter(h => h < 24).length },
        { name: '1–3 dias', n: hours.filter(h => h >= 24 && h < 96).length },
        { name: '4+ dias', n: hours.filter(h => h >= 96).length },
      ],
      plans: ['essencial', 'direcao', 'transformacao'].map((k, i) => ({ name: PLAN_LABEL[k], value: conv.filter(l => planKey(l.plan) === k).length, fill: C(i + 1) })),
      methods: [{ name: 'PIX Automático', value: conv.filter(l => l.method === 'PIX').length, fill: C(1) }, { name: 'Cartão', value: conv.filter(l => l.method === 'Cartão').length, fill: C(2) }],
      outcomes: [
        { name: 'Concluíram', leads: done.length, pagos: convOf(done) },
        { name: 'Interrompidos', leads: interrupted.length, pagos: convOf(interrupted) },
        { name: 'Recomeçaram', leads: restarted.length, pagos: convOf(restarted) },
        { name: 'Em andamento', leads: live.length, pagos: convOf(live) },
        { name: 'Não iniciaram', leads: noStart.length, pagos: convOf(noStart) },
      ],
      engagementBuckets: [
        { name: '0', n: leads.filter(l => l.userMsgs === 0).length },
        { name: '1–3', n: leads.filter(l => l.userMsgs >= 1 && l.userMsgs <= 3).length },
        { name: '4–10', n: leads.filter(l => l.userMsgs >= 4 && l.userMsgs <= 10).length },
        { name: '11–30', n: leads.filter(l => l.userMsgs >= 11 && l.userMsgs <= 30).length },
        { name: '30+', n: leads.filter(l => l.userMsgs > 30).length },
      ],
    };
  }, [leads]);

  const status = (l: Lead) => l.plan ? 'Convertido' : l.checkout ? 'No checkout' : OUTCOME_LABEL[l.outcome];
  const list = leads.filter(l => (filter === 'all' || status(l) === filter) && (!search || `${l.name} ${l.phone} ${l.email}`.toLowerCase().includes(search.toLowerCase())));
  const maxMsgs = Math.max(1, ...leads.map(l => l.userMsgs));

  if (isLoading) return <Skeleton className="h-40 w-full m-6" />;
  if (!isAdmin) return <p className="p-6 text-sm text-muted-foreground">Acesso restrito.</p>;

  const funnel = [
    { name: 'Leads', n: leads.length },
    { name: 'Iniciaram', n: m.started.length },
    { name: 'Engajaram (4+)', n: m.engaged.length },
    { name: 'Concluíram', n: m.done.length },
    { name: 'Checkout', n: m.checkout.length },
    { name: 'Pagaram', n: m.conv.length },
  ].map((s, i, a) => ({ ...s, rate: i === 0 ? '100%' : pct(s.n, a[0].n), step: i === 0 ? '' : pct(s.n, a[i - 1].n) }));

  return <div className="space-y-6 p-4 md:p-6">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Degustação</h1>
        <p className="text-sm text-muted-foreground">Leads pela data do cadastro · horário de Brasília · contas demo excluídas</p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Input type="date" value={range.from} max={range.to} onChange={e => setRange(r => ({ ...r, from: e.target.value }))} className="w-[150px]" aria-label="De" />
        <Input type="date" value={range.to} min={range.from} max={today} onChange={e => setRange(r => ({ ...r, to: e.target.value }))} className="w-[150px]" aria-label="Até" />
        <Button variant="outline" size="icon" onClick={() => q.refetch()} aria-label="Atualizar"><RefreshCw className={`h-4 w-4 ${q.isFetching ? 'animate-spin' : ''}`} /></Button>
      </div>
    </div>

    {q.isLoading ? <div className="grid gap-3 md:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
      : q.error ? <p className="text-sm text-destructive">Não foi possível carregar os dados.</p> : <>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Users} label="Leads" value={leads.length} detail={`${m.started.length} iniciaram (${pct(m.started.length, leads.length)})`} tone={2} />
        <Kpi icon={MessageCircle} label="Engajaram de verdade" value={m.engaged.length} detail={`4+ mensagens · ${m.avgMsgs} msgs em média`} tone={4} />
        <Kpi icon={CheckCircle2} label="Concluíram o encontro" value={m.done.length} detail={`${pct(m.done.length, m.started.length)} dos que iniciaram`} tone={1} />
        <Kpi icon={BadgeDollarSign} label="Viraram clientes" value={m.conv.length} detail={`Conversão global ${pct(m.conv.length, leads.length)}`} tone={5} />
        <Kpi icon={Wallet} label="Receita mensal gerada" value={brl(m.mrr)} detail={`Ticket médio ${m.conv.length ? brl(m.mrr / m.conv.length) : '—'}`} tone={1} />
        <Kpi icon={ShoppingCart} label="Abriram o pagamento" value={m.checkout.length} detail={`${m.checkout.length - m.conv.length} sem concluir`} tone={3} />
        <Kpi icon={Clock} label="Tempo médio de encontro" value={`${m.avgMin} min`} detail={`${m.practice} usaram oração ou meditação`} tone={2} />
        <Kpi icon={TrendingUp} label="Tempo até pagar" value={m.avgHours === null ? '—' : `${m.avgHours} h`} detail={`Compras diretas no período: ${direct.length}`} tone={4} />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader><CardTitle className="text-base">Funil da degustação</CardTitle><CardDescription>% sobre leads · passagem da etapa anterior</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {funnel.map((s, i) => <div key={s.name}>
              <div className="mb-1 flex items-baseline justify-between text-sm">
                <span className="font-medium">{s.name}</span>
                <span className="tabular-nums"><span className="font-semibold">{s.n}</span> <span className="text-muted-foreground">· {s.rate}{s.step && ` · ${s.step} da etapa`}</span></span>
              </div>
              <div className="h-7 w-full rounded-md bg-muted">
                <div className="h-7 rounded-md transition-all" style={{ width: `${Math.max(2, pctN(s.n, funnel[0].n))}%`, background: C(i % 5 + 1) }} />
              </div>
            </div>)}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Profundidade da conversa</CardTitle><CardDescription>Leads por mensagens enviadas</CardDescription></CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer><BarChart data={m.engagementBuckets} margin={{ top: 20, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} stroke="hsl(var(--muted-foreground))" />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} stroke="hsl(var(--muted-foreground))" />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'hsl(var(--muted))' }} formatter={(v: number) => [v, 'Leads']} />
              <Bar dataKey="n" radius={[6, 6, 0, 0]}>{m.engagementBuckets.map((_, i) => <Cell key={i} fill={C(i + 1)} />)}<LabelList dataKey="n" position="top" fontSize={12} /></Bar>
            </BarChart></ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Turmas por dia</CardTitle><CardDescription>Leads, encontros e pagamentos de cada dia de cadastro · linha = taxa de conversão</CardDescription></CardHeader>
        <CardContent className="h-[320px]">
          <ResponsiveContainer><ComposedChart data={m.cohorts} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} stroke="hsl(var(--muted-foreground))" />
            <YAxis yAxisId="l" allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} stroke="hsl(var(--muted-foreground))" />
            <YAxis yAxisId="r" orientation="right" unit="%" tickLine={false} axisLine={false} fontSize={12} stroke="hsl(var(--muted-foreground))" />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'hsl(var(--muted))' }} />
            <Bar yAxisId="l" dataKey="leads" name="Leads" fill={C(2)} radius={[4, 4, 0, 0]} />
            <Bar yAxisId="l" dataKey="started" name="Iniciaram" fill={C(4)} radius={[4, 4, 0, 0]} />
            <Bar yAxisId="l" dataKey="done" name="Concluíram" fill={C(1)} radius={[4, 4, 0, 0]} />
            <Bar yAxisId="l" dataKey="conv" name="Pagaram" fill={C(5)} radius={[4, 4, 0, 0]} />
            <Line yAxisId="r" type="monotone" dataKey="taxa" name="Conversão" unit="%" stroke={C(3)} strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart></ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-base">Conversão por desfecho</CardTitle><CardDescription>Quem paga depois de cada tipo de encontro</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            {m.outcomes.map((o, i) => <div key={o.name}>
              <div className="mb-1 flex justify-between text-sm"><span>{o.name}</span><span className="tabular-nums text-muted-foreground"><span className="font-semibold text-foreground">{pct(o.pagos, o.leads)}</span> · {o.pagos}/{o.leads}</span></div>
              <Progress value={pctN(o.pagos, o.leads)} className="h-2" />
            </div>)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Planos e pagamento</CardTitle><CardDescription>Entre os convertidos</CardDescription></CardHeader>
          <CardContent className="h-[260px]">
            {m.conv.length ? <ResponsiveContainer><PieChart>
              <Tooltip contentStyle={tooltipStyle} />
              <Pie data={m.plans} dataKey="value" nameKey="name" innerRadius={50} outerRadius={75} paddingAngle={3} stroke="none" />
              <Pie data={m.methods} dataKey="value" nameKey="name" innerRadius={84} outerRadius={96} paddingAngle={3} stroke="none" />
            </PieChart></ResponsiveContainer> : <p className="pt-16 text-center text-sm text-muted-foreground">Sem conversões no período.</p>}
          </CardContent>
          <CardContent className="flex flex-wrap gap-2 pt-0">
            {[...m.plans, ...m.methods].map(p => <Badge key={p.name} variant="outline" className="gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: p.fill }} />{p.name}: {p.value}</Badge>)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Janela de conversão</CardTitle><CardDescription>Do cadastro ao pagamento</CardDescription></CardHeader>
          <CardContent className="h-[260px]">
            <ResponsiveContainer><BarChart data={m.window} layout="vertical" margin={{ left: 10, right: 30 }}>
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} fontSize={12} width={80} stroke="hsl(var(--muted-foreground))" />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'hsl(var(--muted))' }} formatter={(v: number) => [v, 'Clientes']} />
              <Bar dataKey="n" fill={C(1)} radius={[0, 6, 6, 0]} barSize={26}><LabelList dataKey="n" position="right" fontSize={12} /></Bar>
            </BarChart></ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div><CardTitle className="text-base">Leads ({list.length})</CardTitle><CardDescription>Situação individual de cada cadastro</CardDescription></div>
          <div className="flex flex-wrap gap-2"><Input placeholder="Buscar nome, telefone ou e-mail" value={search} onChange={e => setSearch(e.target.value)} className="w-[230px]" />
            <Select value={filter} onValueChange={setFilter}><SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger><SelectContent>
              {['all', 'Não iniciou', 'Em andamento', 'Interrompido', 'Concluído', 'No checkout', 'Convertido'].map(s => <SelectItem key={s} value={s}>{s === 'all' ? 'Todos' : s}</SelectItem>)}
            </SelectContent></Select></div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table><TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Cadastro</TableHead><TableHead>Situação</TableHead><TableHead className="w-[180px]">Mensagens</TableHead><TableHead className="text-right">Min</TableHead><TableHead>Práticas</TableHead><TableHead>Plano</TableHead></TableRow></TableHeader><TableBody>
            {list.map(l => <TableRow key={l.id}>
              <TableCell><div className="font-medium">{l.name}</div><div className="text-xs text-muted-foreground">{l.phone || 'Sem telefone'}</div></TableCell>
              <TableCell className="whitespace-nowrap text-sm">{format(new Date(l.createdAt), 'dd/MM HH:mm')}</TableCell>
              <TableCell><Badge variant={l.plan ? 'default' : l.outcome === 'interrompido' ? 'destructive' : l.checkout ? 'secondary' : 'outline'}>{status(l)}</Badge>{l.restarted && <Badge variant="secondary" className="ml-1">Recomeçou</Badge>}</TableCell>
              <TableCell><div className="flex items-center gap-2"><Progress value={(l.userMsgs / maxMsgs) * 100} className="h-1.5" /><span className="w-8 text-right text-sm tabular-nums">{l.userMsgs}</span></div></TableCell>
              <TableCell className="text-right tabular-nums">{l.minutes || '—'}</TableCell>
              <TableCell className="text-xs">{[l.prayer && 'Oração', l.meditation && 'Meditação'].filter(Boolean).join(' · ') || '—'}</TableCell>
              <TableCell className="text-xs">{l.plan ? `${PLAN_LABEL[planKey(l.plan)] || l.plan} · ${l.method}` : '—'}</TableCell>
            </TableRow>)}
          </TableBody></Table>
        </CardContent>
      </Card>
    </>}
  </div>;
}
