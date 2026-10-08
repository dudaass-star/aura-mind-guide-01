import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart';
import { Bar, Line, ComposedChart, CartesianGrid, XAxis, YAxis } from 'recharts';
interface Month { month: string; base: number | null; lost: number | null; rate: number | null; voluntary: number | null; involuntary: number | null; unknown: number | null; trialBase: number | null; recurringBase: number | null; trialLost: number | null; recurringLost: number | null; uncertain: number; status: string }
interface Data { version: number; months: Month[]; warnings: string[]; providerUpdatedAt: string | null }
const config = { trialLost: { label: 'Perdas da semana paga', color: 'hsl(var(--primary))' }, recurringLost: { label: 'Perdas de recorrentes', color: 'hsl(var(--destructive))' }, rate: { label: 'Taxa de churn', color: 'hsl(var(--chart-2))' } };
const label = (m: string) => new Date(`${m}-01T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'America/Sao_Paulo' });
export default function MonthlyChurnChart() {
  const [period, setPeriod] = useState('12');
  const query = useQuery({ queryKey: ['admin-monthly-churn', 2], staleTime: 300_000, queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('admin-monthly-churn', { body: {} });
    if (error || data?.error) throw new Error('Não foi possível carregar o churn.');
    if (data?.version !== 2) throw new Error('A nova base do churn ainda está sendo disponibilizada.');
    return data as Data;
  } });
  const months = (query.data?.months || []).slice(-Number(period));
  return <section className="space-y-5 border-b border-border pb-8" aria-label="Churn mensal">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold text-lg">Churn mensal</h3><p className="text-xs text-muted-foreground mt-1">Clientes pagos ativos no início do mês, incluindo a semana de experimentação.</p></div><Select value={period} onValueChange={setPeriod}><SelectTrigger className="w-[180px]" aria-label="Período do churn"><SelectValue /></SelectTrigger><SelectContent>{[3, 6, 12].map(n => <SelectItem key={n} value={String(n)}>Últimos {n} meses</SelectItem>)}</SelectContent></Select></div>
    {query.isPending ? <div role="status" className="h-[280px] bg-muted/40 animate-pulse flex items-center justify-center text-muted-foreground">Carregando churn…</div> : query.isError ? <div role="alert" className="py-6 space-y-3"><p>{query.error.message}</p><Button variant="outline" onClick={() => query.refetch()}>Tentar novamente</Button></div> : <>
      {!!query.data?.warnings.length && <div role="alert" className="border-l-2 border-destructive pl-4 text-sm space-y-1"><p className="font-semibold text-destructive">Histórico incompleto · resultados parciais</p>{query.data.warnings.map(w => <p key={w} className="text-muted-foreground">{w}</p>)}</div>}
      <ChartContainer config={config} className="h-[300px] w-full aspect-auto"><ComposedChart accessibilityLayer data={months} margin={{ top: 16, left: 0, right: 4, bottom: 4 }}>
        <CartesianGrid vertical={false} /><XAxis dataKey="month" tickFormatter={label} axisLine={false} tickLine={false} minTickGap={20} /><YAxis yAxisId="people" allowDecimals={false} width={32} axisLine={false} tickLine={false} /><YAxis yAxisId="rate" orientation="right" domain={[0, 100]} tickFormatter={v => `${v}%`} width={45} axisLine={false} tickLine={false} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={v => label(String(v))} formatter={(value, name) => <span>{config[name as keyof typeof config]?.label}: <strong>{Number(value).toLocaleString('pt-BR')}{name === 'rate' ? '%' : ''}</strong></span>} />} /><ChartLegend content={<ChartLegendContent />} />
        {(['trialLost', 'recurringLost'] as const).map(key => <Bar key={key} dataKey={key} yAxisId="people" stackId="lost" fill={`var(--color-${key})`} maxBarSize={36} isAnimationActive={false} />)}<Line dataKey="rate" yAxisId="rate" stroke="var(--color-rate)" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
      </ComposedChart></ChartContainer>
      <div className="overflow-x-auto"><table className="w-full text-sm"><caption className="sr-only">Base inicial e perdas por mês</caption><thead><tr className="text-left text-muted-foreground"><th className="py-2 pr-3">Mês</th><th className="text-right px-3">Base inicial</th><th className="text-right px-3">Semana paga</th><th className="text-right px-3">Recorrentes</th><th className="text-right px-3">Perdidos</th><th className="text-right px-3">Perdas semana</th><th className="text-right px-3">Perdas recorrentes</th><th className="text-right pl-3">Churn</th></tr></thead><tbody>{months.map(m => <tr key={m.month} className="border-t border-border"><td className="py-3 pr-3 whitespace-nowrap">{label(m.month)}{m.status === 'current' && <span className="text-xs text-muted-foreground ml-2">Parcial</span>}</td><td className="text-right px-3">{m.base ?? '—'}{!!m.uncertain && <span className="block text-xs text-muted-foreground whitespace-nowrap">Base parcial</span>}</td>{[m.trialBase, m.recurringBase, m.lost, m.trialLost, m.recurringLost].map((v, i) => <td key={i} className="text-right px-3">{v ?? '—'}</td>)}<td className="text-right pl-3 whitespace-nowrap">{m.status === 'no_history' ? 'Sem histórico' : m.uncertain ? 'A conferir' : m.rate === null ? 'Sem base inicial' : `${m.rate.toLocaleString('pt-BR')}%`}</td></tr>)}</tbody></table></div>
      <p className="text-xs text-muted-foreground">Churn = clientes da base inicial que perderam o acesso pago ÷ base inicial. Inclui a semana paga; conversão e troca de plano não são perdas. Cobrança em risco não prova encerramento. Taxas com histórico incompleto ficam a conferir.</p>
      {query.data?.providerUpdatedAt && <p className="text-xs text-muted-foreground">Cartão conferido em {new Date(query.data.providerUpdatedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · PIX conforme registros conciliados.</p>}
    </>}
  </section>;
}
