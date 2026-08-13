import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Painel de funil de checkout por método (cartão x PIX).
// Regra central: contamos PESSOAS (anon_session_id distinto), nunca linhas —
// uma mesma sessão dispara o mesmo passo várias vezes e inflava os números.
// Contas @olaaura.com.br são testes internos e ficam fora de tudo.

const TEST_DOMAIN = "@olaaura.com.br";

type Row = { label: string; card: number | null; pix: number | null; hint?: string };

function startOfMonthBRT(offsetMonths = 0) {
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const d = new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth() + offsetMonths, 1, 3, 0, 0));
  return d;
}

export default function CheckoutFunnelPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthOffset, setMonthOffset] = useState(0);
  const [declines, setDeclines] = useState<{ reason: string; count: number }[]>([]);
  const [planMix, setPlanMix] = useState<{ plan: string; count: number }[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const from = startOfMonthBRT(monthOffset).toISOString();
      const to = startOfMonthBRT(monthOffset + 1).toISOString();

      const [{ data: events }, { data: sessions }] = await Promise.all([
        supabase
          .from("checkout_funnel_events")
          .select("anon_session_id, step, payment_method, plan, detail")
          .gte("created_at", from)
          .lt("created_at", to)
          .limit(20000),
        supabase
          .from("checkout_sessions")
          .select("id, email, payment_method, status")
          .gte("created_at", from)
          .lt("created_at", to)
          .limit(5000),
      ]);

      const ev = events ?? [];
      const uniq = (step: string, method?: "card" | "pix") =>
        new Set(
          ev
            .filter(
              (e) =>
                e.step === step &&
                (!method || (e.payment_method ?? "card") === method) &&
                e.anon_session_id,
            )
            .map((e) => e.anon_session_id),
        ).size;

      const realSessions = (sessions ?? []).filter(
        (s) => !(s.email ?? "").toLowerCase().includes(TEST_DOMAIN),
      );
      const paid = (m: string) =>
        realSessions.filter((s) => (s.payment_method ?? "card") === m && s.status === "paid").length;
      const pixPaid =
        realSessions.filter(
          (s) => (s.payment_method ?? "").startsWith("pix") && s.status === "paid",
        ).length;

      const cardPaid = paid("card");
      const started = uniq("form_submit");
      const mounted = uniq("embedded_mounted");

      setRows([
        { label: "Abriu o checkout", card: uniq("page_view"), pix: null, hint: "sem separar método" },
        { label: "Enviou nome/e-mail/telefone", card: started, pix: null },
        { label: "Formulário do cartão montou", card: mounted, pix: null },
        { label: "Abriu a janela do PIX", card: null, pix: uniq("pix_modal_open") },
        { label: "QR gerado", card: null, pix: uniq("pix_qr_generated") },
        { label: "Copiou o código PIX", card: null, pix: uniq("pix_copy") },
        { label: "Cartão recusado pelo banco", card: uniq("card_declined"), pix: null },
        { label: "PAGOU", card: cardPaid, pix: pixPaid },
        {
          label: "Conversão (pagou / formulário)",
          card: mounted ? Math.round((cardPaid / mounted) * 100) : 0,
          pix: uniq("pix_qr_generated")
            ? Math.round((pixPaid / uniq("pix_qr_generated")) * 100)
            : 0,
          hint: "%",
        },
      ]);

      const declineMap = new Map<string, number>();
      ev.filter((e) => e.step === "card_declined").forEach((e) => {
        const k = e.detail || "desconhecido";
        declineMap.set(k, (declineMap.get(k) ?? 0) + 1);
      });
      setDeclines([...declineMap.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count));

      const planMap = new Map<string, number>();
      ev.filter((e) => e.step === "page_view").forEach((e) => {
        const k = e.plan || "sem plano";
        planMap.set(k, (planMap.get(k) ?? 0) + 1);
      });
      setPlanMix([...planMap.entries()].map(([plan, count]) => ({ plan, count })).sort((a, b) => b.count - a.count));

      setLoading(false);
    };
    void load();
  }, [monthOffset]);

  const monthLabel = startOfMonthBRT(monthOffset).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">
          🧭 Funil de checkout · {monthLabel}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            pessoas distintas · testes internos excluídos
          </span>
        </CardTitle>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={() => setMonthOffset((m) => m - 1)}>
            ←
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={monthOffset >= 0}
            onClick={() => setMonthOffset((m) => Math.min(0, m + 1))}
          >
            →
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-40 animate-pulse rounded bg-muted" />
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="py-1 text-left font-medium">Etapa</th>
                  <th className="py-1 text-right font-medium">Cartão</th>
                  <th className="py-1 text-right font-medium">PIX</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label} className="border-t border-border/50">
                    <td className="py-1.5">
                      {r.label}
                      {r.hint && (
                        <span className="ml-1 text-xs text-muted-foreground">({r.hint})</span>
                      )}
                    </td>
                    <td className="py-1.5 text-right font-medium tabular-nums">
                      {r.card ?? "—"}
                      {r.hint === "%" && r.card !== null ? "%" : ""}
                    </td>
                    <td className="py-1.5 text-right font-medium tabular-nums">
                      {r.pix ?? "—"}
                      {r.hint === "%" && r.pix !== null ? "%" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  Motivos de recusa do banco
                </p>
                {declines.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nenhuma recusa registrada — quem não pagou não chegou a submeter o cartão.
                  </p>
                ) : (
                  <ul className="space-y-0.5 text-xs">
                    {declines.map((d) => (
                      <li key={d.reason} className="flex justify-between">
                        <span>{d.reason}</span>
                        <span className="tabular-nums font-medium">{d.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  Plano na abertura do checkout
                </p>
                <ul className="space-y-0.5 text-xs">
                  {planMix.map((p) => (
                    <li key={p.plan} className="flex justify-between">
                      <span>{p.plan}</span>
                      <span className="tabular-nums font-medium">{p.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
