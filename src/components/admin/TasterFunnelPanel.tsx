import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface WeekRow {
  week: string;
  convites: number;
  codigos: number;
  pagos: number;
}

/**
 * Funil semanal do encontro avulso de R$ 6,90:
 * convite enviado (template m3) → código gerado (aceitou) → pago.
 * Fonte: checkout_sessions.wa_copiou_taster_sent_at + taster_offers.
 */
export default function TasterFunnelPanel() {
  const [rows, setRows] = useState<WeekRow[] | null>(null);

  useEffect(() => {
    (async () => {
      const since = new Date(Date.now() - 8 * 7 * 24 * 60 * 60 * 1000).toISOString();
      const [{ data: sent }, { data: offers }] = await Promise.all([
        supabase
          .from('checkout_sessions')
          .select('wa_copiou_taster_sent_at')
          .not('wa_copiou_taster_sent_at', 'is', null)
          .gte('wa_copiou_taster_sent_at', since),
        supabase
          .from('taster_offers')
          .select('offered_at, accepted_at, paid_at')
          .gte('offered_at', since),
      ]);

      const weekKey = (iso: string) => {
        const d = new Date(iso);
        const day = new Date(d.getTime() - d.getDay() * 86400000); // domingo
        return day.toISOString().slice(0, 10);
      };

      const weeks = new Map<string, WeekRow>();
      const bucket = (k: string) => {
        if (!weeks.has(k)) weeks.set(k, { week: k, convites: 0, codigos: 0, pagos: 0 });
        return weeks.get(k)!;
      };

      for (const s of sent || []) {
        if (s.wa_copiou_taster_sent_at) bucket(weekKey(s.wa_copiou_taster_sent_at)).convites++;
      }
      for (const o of offers || []) {
        if (o.accepted_at) bucket(weekKey(o.accepted_at)).codigos++;
        if (o.paid_at) bucket(weekKey(o.paid_at)).pagos++;
      }

      setRows([...weeks.values()].sort((a, b) => b.week.localeCompare(a.week)));
    })();
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Encontro de R$ 6,90 — funil semanal</CardTitle>
        <p className="text-sm text-muted-foreground">
          Convite por WhatsApp → código gerado → pago. Últimas 8 semanas.
        </p>
      </CardHeader>
      <CardContent>
        {!rows ? (
          <Skeleton className="h-24 w-full" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum convite nas últimas 8 semanas.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                <th className="py-2">Semana de</th>
                <th className="py-2 text-right">Convites</th>
                <th className="py-2 text-right">Códigos</th>
                <th className="py-2 text-right">Pagos</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.week} className="border-b last:border-0">
                  <td className="py-2">
                    {new Date(r.week + 'T12:00:00').toLocaleDateString('pt-BR', {
                      day: '2-digit', month: '2-digit',
                    })}
                  </td>
                  <td className="py-2 text-right">{r.convites}</td>
                  <td className="py-2 text-right">{r.codigos}</td>
                  <td className="py-2 text-right font-medium">{r.pagos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
