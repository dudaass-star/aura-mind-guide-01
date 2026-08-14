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

/** Conciliação diária: nosso funil x envios do CAPI x eventos recebidos no Meta. */
type ReconRow = {
  dia: string;
  inicio_checkout_pessoas: number;
  capi_initiate_checkout: number;
  capi_lead: number;
  capi_purchase: number;
  capi_erros: number;
};

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
  const [recon, setRecon] = useState<ReconRow[]>([]);
  const [reconMeta, setReconMeta] = useState<string | null>(null);
  const [reconLoading, setReconLoading] = useState(false);

  // Leitura direta da API do Meta (somente admin) + nossos contadores por dia.
  const loadRecon = async () => {
    setReconLoading(true);
    setReconMeta(null);
    try {
      const { data, error } = await supabase.functions.invoke("meta-insights", {
        body: { days: 7 },
      });
      if (error) throw error;
      const byDay = (data?.nossos_numeros_por_dia ?? {}) as Record<
        string,
        Omit<ReconRow, "dia">
      >;
      setRecon(
        Object.entries(byDay)
          .map(([dia, v]) => ({ dia, ...v }))
          .sort((a, b) => (a.dia < b.dia ? 1 : -1)),
      );
      const stats = data?.meta_stats;
      setReconMeta(
        stats?.error
          ? `Meta respondeu erro: ${stats.error}`
          : `Pixel ${data?.pixel_id} · último evento recebido: ${
              data?.pixel_info?.last_fired_time ?? "—"
            }`,
      );
    } catch (e) {
      setReconMeta(`Não foi possível ler o Meta agora: ${(e as Error).message}`);
    } finally {
      setReconLoading(false);
    }
  };

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
                // "pix_auto" também é PIX — antes a comparação exata zerava
                // todas as linhas de PIX Automático.
                (!method ||
                  (method === "pix"
                    ? (e.payment_method ?? "").startsWith("pix")
                    : (e.payment_method ?? "card") === "card")) &&
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
      const qrGenerated = uniq("pix_qr_generated", "pix");

      setRows([
        { label: "Abriu o checkout", card: uniq("page_view"), pix: null, hint: "sem separar método" },
        { label: "Enviou nome/e-mail/telefone", card: started, pix: null },
        { label: "Formulário do cartão montou", card: mounted, pix: null },
        { label: "Banco pediu autenticação (3DS)", card: uniq("card_action_required"), pix: null },
        { label: "Abandonou o formulário do cartão", card: uniq("card_abandoned"), pix: null },
        { label: "Abriu a janela do PIX", card: null, pix: uniq("pix_modal_open", "pix") },
        { label: "QR gerado", card: null, pix: qrGenerated },
        { label: "Copiou o código PIX", card: null, pix: uniq("pix_copy", "pix") },
        { label: "Fechou o PIX sem pagar", card: null, pix: uniq("pix_abandoned", "pix") },
        { label: "Cartão recusado pelo banco", card: uniq("card_declined"), pix: null },
        { label: "PAGOU", card: cardPaid, pix: pixPaid },
        {
          label: "Compra confirmada (webhook)",
          card: uniq("purchase_confirmed", "card"),
          pix: uniq("purchase_confirmed", "pix"),
        },
        {
          label: "Cobrança cheia do ciclo (8º dia)",
          card: uniq("subscription_confirmed", "card"),
          pix: uniq("subscription_confirmed", "pix"),
          hint: "entrada de R$ 6,90 que virou assinatura paga",
        },
        {
          label: "Chegou na tela de obrigado",
          card: uniq("purchase"),
          pix: null,
          hint: "sem separar método",
        },
        {
          label: "Clicou no CTA com formulário vazio",
          card: uniq("cta_empty_form"),
          pix: null,
          hint: "sem separar método",
        },
        {
          label: "Conversão (pagou / formulário)",
          card: mounted ? Math.round((cardPaid / mounted) * 100) : 0,
          pix: qrGenerated ? Math.round((pixPaid / qrGenerated) * 100) : 0,
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

            <div className="mt-6 border-t border-border/50 pt-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">
                  Conciliação com o Meta (últimos 7 dias, BRT)
                </p>
                <Button size="sm" variant="outline" onClick={() => void loadRecon()} disabled={reconLoading}>
                  {reconLoading ? "Consultando…" : "Consultar Meta"}
                </Button>
              </div>
              <p className="mb-2 text-xs text-muted-foreground">
                O Gerenciador do Meta mostra <strong>eventos recebidos</strong> (navegador + servidor),
                antes da deduplicação: cada início de checkout real aparece como ~2 eventos lá.
              </p>
              {reconMeta && <p className="mb-2 text-xs text-muted-foreground">{reconMeta}</p>}
              {recon.length > 0 && (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground">
                      <th className="py-1 text-left font-medium">Dia</th>
                      <th className="py-1 text-right font-medium">Início real (pessoas)</th>
                      <th className="py-1 text-right font-medium">CAPI IniciarCheckout</th>
                      <th className="py-1 text-right font-medium">CAPI Lead</th>
                      <th className="py-1 text-right font-medium">CAPI Compra</th>
                      <th className="py-1 text-right font-medium">Erros CAPI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recon.map((r) => (
                      <tr key={r.dia} className="border-t border-border/50">
                        <td className="py-1">{r.dia}</td>
                        <td className="py-1 text-right tabular-nums">{r.inicio_checkout_pessoas}</td>
                        <td className="py-1 text-right tabular-nums">{r.capi_initiate_checkout}</td>
                        <td className="py-1 text-right tabular-nums">{r.capi_lead}</td>
                        <td className="py-1 text-right tabular-nums">{r.capi_purchase}</td>
                        <td className="py-1 text-right tabular-nums">{r.capi_erros}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
