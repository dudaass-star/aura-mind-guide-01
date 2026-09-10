import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// Painel do débito mensal do PIX Automático (Woovi), dia a dia.
//
// Por que existe: quando o mensal do 8º dia não sai, o dinheiro simplesmente não
// entra e ninguém percebe — foi o caso dos mandatos cuja tentativa foi disparada
// contra a parcela errada (vencimento em 2027). Aqui cada dia mostra, no mesmo
// universo: quem venceu, quem pagou, quem ainda aguarda veredito da tentativa e
// quem teve a autorização negada pelo banco (esses não são cobráveis).

const LIVE = ["ATIVA", "APROVADA"];
const DEAD_AUTH = ["REJEITADA", "CANCELADA", "ABANDONADA"];

type Sub = {
  subscription_id: string | null;
  customer_name: string | null;
  plan: string | null;
  value_cents: number | null;
  status: string | null;
  next_charge_date: string | null;
  mandate_approved_at: string | null;
  entry_paid_at: string | null;
  replaced_by_subscription_id: string | null;
};

type Charge = {
  subscription_id: string | null;
  kind: string | null;
  status: string | null;
  due_date: string | null;
  paid_at: string | null;
  value_cents: number | null;
};

type DayRow = {
  dia: string;
  venceram: number;
  pagos: number;
  aguardando: number;
  semTentativa: number;
  negados: number;
  valorPago: number;
};

/** Data de hoje no fuso de Brasília (o vencimento é sempre BRT). */
function brtToday(): string {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

function money(cents: number) {
  return `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}

export default function PixAutomaticoDiaPanel() {
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<DayRow[]>([]);
  const [hojeDetalhe, setHojeDetalhe] = useState<
    { nome: string; plano: string; valor: number; situacao: string }[]
  >([]);

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const hoje = brtToday();
      const desde = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);

      const { data: subsRaw } = await supabase
        .from("woovi_subscriptions")
        .select(
          "subscription_id, customer_name, plan, value_cents, status, next_charge_date, mandate_approved_at, entry_paid_at, replaced_by_subscription_id",
        )
        .not("subscription_id", "is", null)
        .not("entry_paid_at", "is", null)
        .gte("next_charge_date", desde)
        .lte("next_charge_date", hoje)
        .limit(1000);

      const subs = ((subsRaw || []) as Sub[]).filter((s) => !s.replaced_by_subscription_id);

      const ids = subs.map((s) => String(s.subscription_id));
      let charges: Charge[] = [];
      if (ids.length) {
        const { data } = await supabase
          .from("woovi_charges")
          .select("subscription_id, kind, status, due_date, paid_at, value_cents")
          .in("subscription_id", ids)
          .neq("kind", "entry")
          .limit(2000);
        charges = (data || []) as Charge[];
      }

      const bySub = new Map<string, Charge[]>();
      for (const c of charges) {
        const key = String(c.subscription_id);
        const arr = bySub.get(key) || [];
        arr.push(c);
        bySub.set(key, arr);
      }

      /** Situação do ciclo de um mandato na data prevista de débito. */
      const situacaoDe = (s: Sub) => {
        const due = String(s.next_charge_date);
        const mine = (bySub.get(String(s.subscription_id)) || [])
          .filter((c) => !c.due_date || c.due_date >= due);
        const pago = mine.find((c) => c.paid_at);
        if (pago) {
          // Débito executado na madrugada seguinte ao vencimento não é falha:
          // a ordem foi criada depois da janela do dia e a Woovi liquidou no
          // próximo. Marcamos para não parecer atraso do cliente.
          const paidDay = new Date(Date.parse(String(pago.paid_at)) - 3 * 3600 * 1000)
            .toISOString().slice(0, 10);
          const diffDias = Math.round((Date.parse(paidDay) - Date.parse(due)) / 86400000);
          if (diffDias === 1) return { key: "pago_janela", valor: Number(pago.value_cents || 0) };
          return { key: "pago", valor: Number(pago.value_cents || 0) };
        }
        if (DEAD_AUTH.includes(String(s.status || "").toUpperCase())) {
          return { key: "negado", valor: 0 };
        }
        // Tentativa pedida à Woovi e sem veredito ainda.
        const pedida = mine.some((c) =>
          ["RETRY_REQUESTED", "COBR_CREATED", "ACTIVE", "CREATED", "PENDING"].includes(
            String(c.status || "").toUpperCase(),
          )
        );
        if (pedida) return { key: "aguardando", valor: 0 };
        return { key: "sem_tentativa", valor: 0 };
      };

      const map = new Map<string, DayRow>();
      for (const s of subs) {
        const dia = String(s.next_charge_date);
        const row = map.get(dia) || {
          dia,
          venceram: 0,
          pagos: 0,
          aguardando: 0,
          semTentativa: 0,
          negados: 0,
          valorPago: 0,
        };
        row.venceram += 1;
        const sit = situacaoDe(s);
        if (sit.key === "pago") {
          row.pagos += 1;
          row.valorPago += sit.valor;
        } else if (sit.key === "aguardando") row.aguardando += 1;
        else if (sit.key === "negado") row.negados += 1;
        else row.semTentativa += 1;
        map.set(dia, row);
      }

      setDays(Array.from(map.values()).sort((a, b) => b.dia.localeCompare(a.dia)));

      const labels: Record<string, string> = {
        pago: "Pago",
        pago_janela: "Pago na janela seguinte",
        aguardando: "Aguardando veredito",
        sem_tentativa: "Sem cobrança",
        negado: "Autorização negada",
      };
      setHojeDetalhe(
        subs
          .filter((s) => String(s.next_charge_date) === hoje)
          .map((s) => {
            const sit = situacaoDe(s);
            return {
              nome: s.customer_name || "—",
              plano: s.plan || "—",
              valor: Number(s.value_cents || 0),
              situacao: labels[sit.key] || sit.key,
            };
          })
          .sort((a, b) => a.situacao.localeCompare(b.situacao)),
      );
    } finally {
      setLoading(false);
    }
  };

  const badge = (situacao: string) => {
    if (situacao === "Pago") return <Badge className="bg-emerald-600 text-white text-[10px]">Pago</Badge>;
    if (situacao === "Aguardando veredito") return <Badge variant="secondary" className="text-[10px]">Aguardando veredito</Badge>;
    if (situacao === "Autorização negada") return <Badge variant="outline" className="text-[10px]">Autorização negada</Badge>;
    return <Badge variant="destructive" className="text-[10px]">Sem cobrança</Badge>;
  };

  return (
    <Card className="border-emerald-500/20 bg-emerald-500/5">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold">
          PIX Automático · débito mensal por dia
        </CardTitle>
        <Button variant="ghost" size="sm" className="text-xs" onClick={() => void load()}>
          Atualizar
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-[11px] text-muted-foreground">
          Só mandatos que pagaram a entrada. Venceram = data prevista do débito no dia.
          Aguardando veredito = tentativa pedida à Woovi, ainda sem resposta.
          Autorização negada = o banco derrubou o mandato, não é cobrável por PIX Automático.
        </p>

        {loading ? (
          <p className="text-xs text-muted-foreground">Carregando…</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr className="text-left">
                    <th className="py-1 pr-3">Dia</th>
                    <th className="py-1 pr-3">Venceram</th>
                    <th className="py-1 pr-3">Pagos</th>
                    <th className="py-1 pr-3">Aguardando</th>
                    <th className="py-1 pr-3">Sem cobrança</th>
                    <th className="py-1 pr-3">Aut. negada</th>
                    <th className="py-1">Recebido</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((d) => (
                    <tr key={d.dia} className="border-t">
                      <td className="py-1 pr-3 font-medium">{d.dia.split("-").reverse().join("/")}</td>
                      <td className="py-1 pr-3">{d.venceram}</td>
                      <td className="py-1 pr-3 text-emerald-600 font-medium">{d.pagos}</td>
                      <td className="py-1 pr-3">{d.aguardando}</td>
                      <td className="py-1 pr-3 text-destructive">{d.semTentativa}</td>
                      <td className="py-1 pr-3">{d.negados}</td>
                      <td className="py-1">{money(d.valorPago)}</td>
                    </tr>
                  ))}
                  {days.length === 0 && (
                    <tr><td colSpan={7} className="py-2 text-muted-foreground">Nenhum vencimento nos últimos 14 dias.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div>
              <p className="text-xs font-medium mb-1">Hoje, pessoa por pessoa</p>
              {hojeDetalhe.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum débito previsto para hoje.</p>
              ) : (
                <ul className="space-y-1">
                  {hojeDetalhe.map((p, i) => (
                    <li key={`${p.nome}-${i}`} className="flex items-center justify-between gap-2 text-xs border-t pt-1">
                      <span className="truncate">{p.nome}</span>
                      <span className="text-muted-foreground whitespace-nowrap">{p.plano} · {money(p.valor)}</span>
                      {badge(p.situacao)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
