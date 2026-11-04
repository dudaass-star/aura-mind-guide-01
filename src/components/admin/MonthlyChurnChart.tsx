import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart';
import { Bar, Line, ComposedChart, CartesianGrid, XAxis, YAxis, ReferenceArea } from 'recharts';
interface Month { month: string; recStartBase: number; recNew: number; recExposed: number; recLost: number; recUncertain: number; recRate: number | null; base: number | null; lost: number | null; rate: number | null; voluntary: number | null; involuntary: number | null; unknown: number | null; trialBase: number | null; recurringBase: number | null; trialLost: number | null; recurringLost: number | null; uncertain: number; status: string }
interface Data { version: number; months: Month[]; warnings: string[]; providerUpdatedAt: string | null }
const config = { trialLost: { label: 'Perdas da semana paga', color: 'hsl(var(--primary))' }, recurringLost: { label: 'Perdas de recorrentes', color: 'hsl(var(--destructive))' }, recLost: { label: 'Assinantes perdidos', color: 'hsl(var(--destructive))' }, rate: { label: 'Taxa de churn', color: 'hsl(var(--chart-2))' }, recRate: { label: 'Churn recorrente', color: 'hsl(var(--chart-2))' } };
const label = (m: string) => new Date(`${m}-01T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'America/Sao_Paulo' });
type View = 'recorrente' | 'semana' | 'consolidado';

export default function MonthlyChurnChart({ conversion }: { conversion?: ReactNode }) {
  const [period, setPeriod] = useState('12');
  const [view, setView] = useState<View>('recorrente');
  const query = useQuery({ queryKey: ['admin-monthly-churn', 5], staleTime: 300_000, queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('admin-monthly-churn', { body: {} });
    if (error || data?.error) throw new Error('Não foi possível carregar o churn.');
    if (data?.version !== 5) throw new Error('A nova base do churn ainda está sendo disponibilizada.');
    return data as Data;
  } });
  const months = (query.data?.months || []).slice(-Number(period));
  const rec = view === 'recorrente';
  const unverified = months.filter(m => (rec ? m.recUncertain : m.uncertain) > 0);
  const title = view === 'semana' ? 'Conversão da semana paga' : rec ? 'Churn recorrente' : 'Churn consolidado';
  const subtitle = view === 'semana' ? 'Quem comprou a semana e pagou a primeira mensalidade.' : rec ? 'Apenas assinantes que já pagaram mensalidade cheia; a base cresce quando alguém vira mensal.' : 'Todos os pagantes ativos no início do mês, incluindo a semana paga.';
  const rateKey = rec ? 'recRate' : 'rate';
  const bars = rec ? (['recLost'] as const) : (['trialLost', 'recurringLost'] as const);

  return <section className="space-y-5 border-b border-border pb-8" aria-label="Retenção e conversão">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="font-semibold text-lg">{title}</h3><p className="text-xs text-muted-foreground mt-1">{subtitle}</p></div>
      <div className="flex flex-wrap gap-2">
        <Tabs value={view} onValueChange={v => setView(v as View)}><TabsList><TabsTrigger value="recorrente">Recorrentes</TabsTrigger><TabsTrigger value="semana">Semana paga</TabsTrigger><TabsTrigger value="consolidado">Consolidado</TabsTrigger></TabsList></Tabs>
        {view !== 'semana' && <Select value={period} onValueChange={setPeriod}><SelectTrigger className="w-[170px]" aria-label="Período do churn"><SelectValue /></SelectTrigger><SelectContent>{[3, 6, 12].map(n => <SelectItem key={n} value={String(n)}>Últimos {n} meses</SelectItem>)}</SelectContent></Select>}
      </div>
    </div>
    {view === 'semana' ? (conversion ?? <p className="text-sm text-muted-foreground">Dados de conversão aguardando atualização.</p>) :
    query.isPending ? <div role="status" className="h-[280px] bg-muted/40 animate-pulse flex items-center justify-center text-muted-foreground">Carregando churn…</div> : query.isError ? <div role="alert" className="py-6 space-y-3"><p>{query.error.message}</p><Button variant="outline" onClick={() => query.refetch()}>Tentar novamente</Button></div> : <>
      {!!query.data?.warnings.length && <div role="alert" className="border-l-2 border-destructive pl-4 text-sm space-y-1"><p className="font-semibold text-destructive">Histórico incompleto · resultados parciais</p>{query.data.warnings.map(w => <p key={w} className="text-muted-foreground">{w}</p>)}</div>}
      {unverified.length > 0 && <p className="text-sm text-destructive font-medium">Taxa não validada: {unverified.map(m => label(m.month)).join(', ')}. As barras destes meses mostram apenas perdas comprovadas.</p>}
      <ChartContainer config={config} className="h-[300px] w-full aspect-auto"><ComposedChart accessibilityLayer data={months} margin={{ top: 16, left: 0, right: 4, bottom: 4 }}>
        <CartesianGrid vertical={false} /><XAxis dataKey="month" tickFormatter={label} axisLine={false} tickLine={false} minTickGap={20} /><YAxis yAxisId="people" allowDecimals={false} width={32} axisLine={false} tickLine={false} /><YAxis yAxisId="rate" orientation="right" domain={[0, rec ? 'auto' : 100]} tickFormatter={v => `${v}%`} width={45} axisLine={false} tickLine={false} />
        {unverified.length > 0 && <ReferenceArea yAxisId="people" x1={unverified[0].month} x2={unverified[unverified.length - 1].month} fill="hsl(var(--muted))" fillOpacity={0.5} strokeOpacity={0} label={{ value: 'Taxa a conferir', position: 'insideTop' }} />}
        <ChartTooltip content={<ChartTooltipContent labelFormatter={v => label(String(v))} formatter={(value, name) => <span>{config[name as keyof typeof config]?.label}: <strong>{Number(value).toLocaleString('pt-BR')}{String(name).toLowerCase().includes('rate') ? '%' : ''}</strong></span>} />} /><ChartLegend content={<ChartLegendContent />} />
        {bars.map(key => <Bar key={key} dataKey={key} yAxisId="people" stackId="lost" fill={`var(--color-${key})`} maxBarSize={36} isAnimationActive={false} />)}<Line dataKey={rateKey} yAxisId="rate" stroke={`var(--color-${rateKey})`} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
      </ComposedChart></ChartContainer>
      <div className="overflow-x-auto"><table className="w-full text-sm"><caption className="sr-only">Base e perdas por mês</caption>
        {rec ? <>
          <thead><tr className="text-left text-muted-foreground"><th className="py-2 pr-3">Mês</th><th className="text-right px-3">Assinantes no dia 1º</th><th className="text-right px-3">Viraram mensais no mês</th><th className="text-right px-3">Base do mês</th><th className="text-right px-3">Perdidos</th><th className="text-right pl-3">Churn</th></tr></thead>
          <tbody>{months.map(m => <tr key={m.month} className="border-t border-border"><td className="py-3 pr-3 whitespace-nowrap">{label(m.month)}{m.status === 'current' && <span className="text-xs text-muted-foreground ml-2">Parcial</span>}</td>{m.status === 'no_history' ? <td colSpan={5} className="text-right">Sem histórico</td> : <>{[m.recStartBase, m.recNew, m.recExposed, m.recLost].map((v, i) => <td key={i} className="text-right px-3">{v}</td>)}<td className="text-right pl-3 whitespace-nowrap">{m.recUncertain ? 'A conferir' : m.recRate === null ? 'Sem base' : `${m.recRate.toLocaleString('pt-BR')}%`}</td></>}</tr>)}</tbody>
        </> : <>
          <thead><tr className="text-left text-muted-foreground"><th className="py-2 pr-3">Mês</th><th className="text-right px-3">Base inicial</th><th className="text-right px-3">Semana paga</th><th className="text-right px-3">Recorrentes</th><th className="text-right px-3">Perdidos</th><th className="text-right px-3">Perdas semana</th><th className="text-right px-3">Perdas recorrentes</th><th className="text-right pl-3">Churn</th></tr></thead>
          <tbody>{months.map(m => <tr key={m.month} className="border-t border-border"><td className="py-3 pr-3 whitespace-nowrap">{label(m.month)}{m.status === 'current' && <span className="text-xs text-muted-foreground ml-2">Parcial</span>}</td><td className="text-right px-3">{m.base ?? '—'}</td>{[m.trialBase, m.recurringBase, m.lost, m.trialLost, m.recurringLost].map((v, i) => <td key={i} className="text-right px-3">{v ?? '—'}</td>)}<td className="text-right pl-3 whitespace-nowrap">{m.status === 'no_history' ? 'Sem histórico' : m.uncertain ? 'A conferir' : m.rate === null ? 'Sem base inicial' : `${m.rate.toLocaleString('pt-BR')}%`}</td></tr>)}</tbody>
        </>}
      </table></div>
      <p className="text-xs text-muted-foreground">{rec
        ? 'Churn recorrente = assinantes que perderam o acesso no mês ÷ (assinantes no dia 1º + quem pagou a primeira mensalidade durante o mês). Quem só fez a semana paga não entra. Troca de plano não é perda.'
        : 'Churn consolidado = pagantes da base inicial que perderam o acesso ÷ base inicial, incluindo a semana paga. Use apenas para auditoria.'}</p>
      {query.data?.providerUpdatedAt && <p className="text-xs text-muted-foreground">Cartão conferido em {new Date(query.data.providerUpdatedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · PIX conforme registros conciliados.</p>}
    </>}
  </section>;
}
