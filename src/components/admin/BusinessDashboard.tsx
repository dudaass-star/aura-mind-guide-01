import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart';
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { RefreshCw, CalendarDays, AlertCircle, ChevronDown } from 'lucide-react';
import { format, subDays } from 'date-fns';
import MonthlyChurnChart from './MonthlyChurnChart';

interface BillingEntry { id: string; name?: string; email?: string; plan: string; provider: string; due: string | null; paid: string | null; cents: number; receivedCents?: number }
interface DailyUsage { date: string; active: number; messages: number; completed: number; missed: number }
interface DashboardData { billing: BillingEntry[]; days: DailyUsage[]; conversion?: { cohorts: { id: string; provider: string; due: string; paid: string | null }[]; expected: number; converted: number; rate: number | null; warnings: string[] }; warnings: string[]; updatedAt: string; providerUpdatedAt?: string | null; issues?: { provider: string; reason: string; count: number; cents: number }[]; completeness?: string }
const brtNow = () => new Date(`${new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10)}T12:00:00`);
const shortDate = (date: string | null) => date ? date.slice(5).split('-').reverse().join('/') : 'Não comprovado';
const currency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const config = {
  expected: { label: 'Previstas', color: 'hsl(var(--primary))' },
  received: { label: 'Recebidas', color: 'hsl(var(--chart-2))' },
  firstExpected: { label: 'Primeiras mensalidades previstas', color: 'hsl(var(--primary))' },
  firstPaid: { label: 'Primeiras mensalidades pagas', color: 'hsl(var(--chart-2))' },
  active: { label: 'Pessoas que conversaram', color: 'hsl(var(--primary))' },
  completed: { label: 'Realizadas', color: 'hsl(var(--chart-2))' },
  missed: { label: 'Faltas', color: 'hsl(var(--destructive))' },
};

function DailyChart({ data, series, money = false }: { data: Record<string, unknown>[]; series: string[]; money?: boolean }) {
  return <ChartContainer config={config} className="h-[280px] w-full aspect-auto">
    <LineChart accessibilityLayer data={data} margin={{ top: 16, left: 4, right: 12, bottom: 4 }}>
      <CartesianGrid vertical={false} />
      <XAxis dataKey="date" tickFormatter={shortDate} tickLine={false} axisLine={false} minTickGap={28} />
      <YAxis tickLine={false} axisLine={false} allowDecimals={money} width={money ? 70 : 35} tickFormatter={money ? v => `R$ ${v}` : undefined} />
      <ChartTooltip content={<ChartTooltipContent labelFormatter={value => shortDate(String(value))} formatter={(value, name) => <span>{config[name as keyof typeof config]?.label}: <strong>{money ? currency(Number(value)) : String(value)}</strong></span>} />} />
      <ChartLegend content={<ChartLegendContent />} />
      {series.map(key => <Line key={key} dataKey={key} type="linear" stroke={`var(--color-${key})`} strokeWidth={2} dot={false} activeDot={{ r: 5 }} isAnimationActive={false} />)}
    </LineChart>
  </ChartContainer>;
}

export default function BusinessDashboard({ onlyUsage = false, dateRange }: { onlyUsage?: boolean; dateRange?: { from: string; to: string } }) {
  const [from, setFrom] = useState(() => format(subDays(brtNow(), 29), 'yyyy-MM-dd'));
  const [to, setTo] = useState(() => format(brtNow(), 'yyyy-MM-dd'));
  const [localRange, setRange] = useState({ from, to });
  const range = dateRange || localRange;
  const [unit, setUnit] = useState('count');
  const [provider, setProvider] = useState('all');
  const [conversionProvider, setConversionProvider] = useState('all');
  const [preset, setPreset] = useState('30');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [validation, setValidation] = useState('');
  const [definitions, setDefinitions] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  async function loadDashboard(): Promise<DashboardData> {
    const { data, error } = await supabase.functions.invoke('admin-business-dashboard', { body: { dateFrom: range.from, dateTo: range.to } });
    if (error || data?.error) throw new Error(data?.error || 'Não foi possível carregar os gráficos.');
    return data as DashboardData;
  }
  const query = useQuery({
    queryKey: ['admin-business-dashboard', range.from, range.to],
    queryFn: () => loadDashboard(),
    staleTime: 300_000,
  });
  const refresh = async () => {
    setRefreshing(true);
    try { const result = await query.refetch(); if (result.error) throw result.error; setValidation(''); }
    catch { setValidation('Não foi possível atualizar. Os dados anteriores foram mantidos.'); }
    finally { setRefreshing(false); }
  };
  function apply(nextFrom = from, nextTo = to) {
    if (!nextFrom || !nextTo || nextFrom > nextTo || (Date.parse(nextTo) - Date.parse(nextFrom)) / 864e5 > 365) { setValidation('Escolha um período válido de até 366 dias.'); return; }
    setValidation(''); setRange({ from: nextFrom, to: nextTo }); setSelectedDay(null);
  }
  const rows = (query.data?.billing || []).filter(b => provider === 'all' || b.provider === provider);
  const money = unit === 'money';
  const days = (query.data?.days || []).map(d => {
    const expected = rows.filter(b => b.due === d.date);
    const received = rows.filter(b => b.paid === d.date);
    return { ...d, expected: money ? expected.reduce((s, b) => s + b.cents, 0) / 100 : expected.length, received: money ? received.reduce((s, b) => s + (b.receivedCents ?? b.cents), 0) / 100 : received.length };
  });
  const dueRows = rows.filter(b => b.due && b.due >= range.from && b.due <= range.to);
  const paidRows = rows.filter(b => b.paid && b.paid >= range.from && b.paid <= range.to);
  const pending = dueRows.filter(b => !b.paid && b.due && b.due < format(brtNow(), 'yyyy-MM-dd'));
  const conversion = query.data?.conversion;
  const conversionRows = (conversion?.cohorts || []).filter(c => conversionProvider === 'all' || c.provider === conversionProvider);
  const converted = conversionRows.filter(c => c.paid).length;
  const conversionDays = days.map(d => ({ date: d.date, firstExpected: conversionRows.filter(c => c.due === d.date).length, firstPaid: conversionRows.filter(c => c.due === d.date && c.paid).length }));
  const totals = [
    { label: 'Mensalidades previstas', value: money ? currency(dueRows.reduce((s, b) => s + b.cents, 0) / 100) : dueRows.length, detail: 'Vencimentos no período' },
    { label: 'Mensalidades recebidas', value: money ? currency(paidRows.reduce((s, b) => s + (b.receivedCents ?? b.cents), 0) / 100) : paidRows.length, detail: 'Entradas no dia do pagamento' },
    { label: 'Vencidas sem pagamento', value: money ? currency(pending.reduce((s, b) => s + b.cents, 0) / 100) : pending.length, detail: 'Vencimentos anteriores a hoje' },
    { label: 'Sessões realizadas', value: days.reduce((s, d) => s + d.completed, 0), detail: 'Agendadas no período' },
  ];
  return <div className="space-y-8 py-4">
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
      <div><h2 className="text-xl font-semibold">{onlyUsage ? 'Uso e continuidade' : 'Panorama do negócio'}</h2><p className="text-sm text-muted-foreground mt-1">{shortDate(range.from)} a {shortDate(range.to)} · horário de Brasília</p></div>
      {!dateRange && <div className="flex flex-wrap items-end gap-2">
        <Select value={preset} onValueChange={v => { setPreset(v); const end = format(brtNow(), 'yyyy-MM-dd'); const start = format(subDays(brtNow(), Number(v) - 1), 'yyyy-MM-dd'); setFrom(start); setTo(end); apply(start, end); }}><SelectTrigger className="w-[145px]" aria-label="Período rápido"><CalendarDays className="mr-2 h-4 w-4" /><SelectValue placeholder="Personalizado" /></SelectTrigger><SelectContent>{[7, 30, 90].map(n => <SelectItem key={n} value={String(n)}>Últimos {n} dias</SelectItem>)}</SelectContent></Select>
        <label className="text-xs text-muted-foreground">De<Input aria-label="Data inicial do gráfico" type="date" value={from} onChange={e => { setPreset(''); setFrom(e.target.value); }} className="w-[145px] text-foreground" /></label>
        <label className="text-xs text-muted-foreground">Até<Input aria-label="Data final do gráfico" type="date" value={to} onChange={e => { setPreset(''); setTo(e.target.value); }} className="w-[145px] text-foreground" /></label>
        <Button variant="outline" onClick={() => apply()}>Aplicar</Button><Button variant="ghost" size="icon" aria-label="Atualizar gráficos" title="Atualizar gráficos" onClick={refresh} disabled={query.isFetching || refreshing}><RefreshCw className={`h-4 w-4 ${query.isFetching || refreshing ? 'animate-spin' : ''}`} /></Button>
      </div>}
    </div>
    {query.data?.providerUpdatedAt && <p className="text-xs text-muted-foreground">Dados dos provedores conferidos em {new Date(query.data.providerUpdatedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · atualização automática</p>}
    {validation && <p role="alert" className="text-sm text-destructive">{validation}</p>}
    {!onlyUsage && <MonthlyChurnChart />}
    {query.isPending ? <div className="h-[420px] bg-muted/40 animate-pulse flex items-center justify-center text-muted-foreground" role="status">Carregando gráficos…</div> : query.isError ? <div role="alert" className="py-12 text-center space-y-3"><AlertCircle className="mx-auto h-6 w-6 text-destructive" /><p>Não foi possível carregar o panorama.</p><Button variant="outline" onClick={() => query.refetch()}>Tentar novamente</Button></div> : <>
      {!onlyUsage && <>
        {!!query.data?.issues?.length && <div role="alert" className="border-l-2 border-destructive pl-4 text-sm space-y-1"><p className="font-semibold text-destructive">Conciliação incompleta — não usar como fechamento financeiro</p>{query.data.issues.map((issue, index) => <p key={index} className="text-muted-foreground">{issue.reason}: {issue.count}{issue.cents > 0 ? ` · ${currency(issue.cents / 100)}` : ''}</p>)}</div>}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">{totals.map(t => <div key={t.label} className="border-l-2 border-border pl-4"><p className="text-sm text-muted-foreground">{t.label}</p><p className="text-3xl font-semibold mt-2">{t.value}</p><p className="text-xs text-muted-foreground mt-1">{t.detail}</p></div>)}</div>
        <section className="space-y-4 border-b border-border pb-8">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold text-lg">Mensalidades · previstas × recebidas</h3><p className="text-xs text-muted-foreground mt-1">Recebidas no dia real do pagamento, inclusive mensalidades atrasadas.</p></div><div className="flex flex-wrap gap-2"><Select value={provider} onValueChange={v => { setProvider(v); setSelectedDay(null); }}><SelectTrigger className="w-[160px]" aria-label="Meio de pagamento"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Cartão e PIX</SelectItem><SelectItem value="stripe">Cartão · Stripe</SelectItem><SelectItem value="woovi">PIX · Woovi</SelectItem><SelectItem value="asaas">PIX · Asaas</SelectItem><SelectItem value="inter">PIX · Inter</SelectItem></SelectContent></Select><Tabs value={unit} onValueChange={setUnit}><TabsList><TabsTrigger value="count">Quantidade</TabsTrigger><TabsTrigger value="money">R$</TabsTrigger></TabsList></Tabs></div></div>
          <DailyChart data={days} series={['expected', 'received']} money={money} />
          {!rows.length && <p className="text-sm text-muted-foreground">Nenhuma mensalidade registrada neste período e meio de pagamento.</p>}
          <div className="flex flex-wrap justify-between items-center gap-3"><Button variant="ghost" size="sm" onClick={() => setDefinitions(!definitions)} aria-expanded={definitions}><ChevronDown className="mr-2 h-4 w-4" />Fontes e critérios</Button><Select value={selectedDay || ''} onValueChange={setSelectedDay}><SelectTrigger className="w-[180px]" aria-label="Consultar dia"><SelectValue placeholder="Consultar um dia" /></SelectTrigger><SelectContent>{days.map(d => <SelectItem key={d.date} value={d.date}>{shortDate(d.date)}</SelectItem>)}</SelectContent></Select></div>
          {definitions && <div className="text-xs text-muted-foreground space-y-2 border-t pt-4"><p>Cartão: faturas mensais do Stripe. PIX: cobranças e pagamentos conciliados; entradas semanais e tentativas repetidas não contam como mensalidades.</p>{query.data?.warnings.map(w => <p key={w}>{w}</p>)}<p>Previstas e recebidas são séries independentes. O total recebido não é uma taxa de pagamento dos vencimentos do período.</p><p>Atualizado em {new Date(query.data?.updatedAt || '').toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.</p></div>}
          {selectedDay && <div className="overflow-x-auto border-t pt-4"><h4 className="font-semibold mb-3">Mensalidades de {shortDate(selectedDay)}</h4><table className="w-full text-sm"><thead><tr className="text-left text-muted-foreground"><th className="py-2">Cliente</th><th>Meio</th><th>Vencimento</th><th>Pagamento</th><th className="text-right">Valor</th></tr></thead><tbody>{rows.filter(r => r.due === selectedDay || r.paid === selectedDay).map(r => <tr key={r.id} className="border-t border-border"><td className="py-3 pr-4">{r.name || r.email || 'Cliente sem nome'}</td><td className="pr-4">{r.provider === 'stripe' ? 'Cartão' : 'PIX'}</td><td className="pr-4">{shortDate(r.due)}</td><td className="pr-4">{r.paid ? shortDate(r.paid) : 'Não registrado'}</td><td className="text-right whitespace-nowrap">{currency(r.cents / 100)}</td></tr>)}</tbody></table>{!rows.some(r => r.due === selectedDay || r.paid === selectedDay) && <p className="text-muted-foreground py-4">Nenhuma mensalidade neste dia.</p>}</div>}
        </section>
        <section className="space-y-5 border-b border-border pb-8" aria-label="Conversão da semana para primeira mensalidade">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold text-lg">Semana paga → primeira mensalidade</h3><p className="text-xs text-muted-foreground mt-1">Conversões pela data prevista da primeira mensalidade, inclusive pagamentos posteriores.</p></div><Select value={conversionProvider} onValueChange={setConversionProvider}><SelectTrigger className="w-[160px]" aria-label="Meio da primeira mensalidade"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Cartão e PIX</SelectItem><SelectItem value="stripe">Cartão</SelectItem><SelectItem value="woovi">PIX · Woovi</SelectItem></SelectContent></Select></div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="border-l-2 border-border pl-4"><p className="text-sm text-muted-foreground">Primeiras mensalidades previstas</p><p className="text-3xl font-semibold mt-2">{conversion ? conversionRows.length : '—'}</p></div>
            <div className="border-l-2 border-border pl-4"><p className="text-sm text-muted-foreground">Clientes convertidos</p><p className="text-3xl font-semibold mt-2">{conversion ? converted : '—'}</p></div>
            <div className="border-l-2 border-border pl-4"><p className="text-sm text-muted-foreground">Taxa de conversão</p><p className="text-3xl font-semibold mt-2">{conversionRows.length ? `${(converted / conversionRows.length * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—'}</p></div>
          </div>
          {conversion && <DailyChart data={conversionDays} series={['firstExpected', 'firstPaid']} />}
          {conversion && !conversionRows.length && <p className="text-sm text-muted-foreground">Nenhuma semana paga com primeira mensalidade prevista neste período e meio de pagamento.</p>}
          {!conversion && <p role="status" className="text-sm text-muted-foreground">Dados de conversão aguardando atualização.</p>}
          {!!conversion?.warnings.length && <div role="alert" className="border-l-2 border-destructive pl-4 text-sm"><p className="font-semibold text-destructive">Conversão parcial</p>{conversion.warnings.map(w => <p key={w} className="text-muted-foreground">{w}</p>)}</div>}
          <p className="text-xs text-muted-foreground">Cancelamentos após a semana permanecem na base. Semanas cuja primeira mensalidade ainda não venceu ficam fora. Conversão = clientes com a primeira mensalidade paga ÷ clientes previstos; pagamentos conferidos até a última atualização.</p>
        </section>
      </>}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <section className="min-w-0"><h3 className="text-lg font-semibold">Pessoas que conversaram no App</h3><p className="text-xs text-muted-foreground mt-1 mb-3">Pessoas únicas por dia · não conta apenas abrir o aplicativo</p><DailyChart data={days} series={['active']} /></section>
        <section className="min-w-0"><h3 className="text-lg font-semibold">Sessões · realizadas e faltas</h3><p className="text-xs text-muted-foreground mt-1 mb-3">Agrupadas pela data agendada · sem contas de demonstração</p><DailyChart data={days} series={['completed', 'missed']} /></section>
      </div>
    </>}
  </div>;
}
