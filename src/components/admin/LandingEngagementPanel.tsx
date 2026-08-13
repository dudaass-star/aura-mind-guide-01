import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Painel de engajamento da landing /v2.
// Pergunta que ele responde: o lead lê a página ou clica no CTA de cima sem rolar?
// Contamos PESSOAS (anon_session_id distinto), nunca linhas.

const CTA_LABELS: Record<string, string> = {
  hero: "Topo (hero)",
  header: "Menu (header)",
  demo: "Depois da demo",
  pricing: "Preços",
  final: "CTA final",
  sticky: "Barra fixa (mobile)",
};

function startOfMonthBRT(offsetMonths = 0) {
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth() + offsetMonths, 1, 3, 0, 0));
}

type Depth = { label: string; people: number; pct: number };

export default function LandingEngagementPanel() {
  const [loading, setLoading] = useState(true);
  const [monthOffset, setMonthOffset] = useState(0);
  const [views, setViews] = useState(0);
  const [depths, setDepths] = useState<Depth[]>([]);
  const [ctas, setCtas] = useState<{ label: string; people: number }[]>([]);
  const [noScrollClicks, setNoScrollClicks] = useState(0);
  const [totalClicks, setTotalClicks] = useState(0);
  const [srcPaid, setSrcPaid] = useState<{ src: string; arrived: number; paid: number }[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const from = startOfMonthBRT(monthOffset).toISOString();
      const to = startOfMonthBRT(monthOffset + 1).toISOString();

      const { data: events } = await supabase
        .from("checkout_funnel_events")
        .select("anon_session_id, step, detail, meta, created_at")
        .gte("created_at", from)
        .lt("created_at", to)
        .limit(30000);

      const ev = events ?? [];
      const uniq = (pred: (e: typeof ev[number]) => boolean) =>
        new Set(ev.filter((e) => pred(e) && e.anon_session_id).map((e) => e.anon_session_id)).size;

      const totalViews = uniq((e) => e.step === "landing_view");
      setViews(totalViews);

      const pctOf = (n: number) => (totalViews ? Math.round((n / totalViews) * 100) : 0);
      setDepths(
        ([25, 50, 75, 100] as const).map((m) => {
          const people = uniq((e) => e.step === `landing_scroll_${m}`);
          return { label: `Rolou ${m}%`, people, pct: pctOf(people) };
        }),
      );

      const clickEvents = ev.filter((e) => e.step === "landing_cta_click");
      const byCta = new Map<string, Set<string>>();
      let noScroll = 0;
      const clickSessions = new Set<string>();
      for (const e of clickEvents) {
        const key = e.detail ?? "desconhecido";
        if (!byCta.has(key)) byCta.set(key, new Set());
        if (e.anon_session_id) byCta.get(key)!.add(e.anon_session_id);
        const meta = (e.meta ?? {}) as Record<string, unknown>;
        const scrolled = meta.scrolled === true || Number(meta.max_scroll ?? 0) >= 10;
        if (e.anon_session_id && !clickSessions.has(e.anon_session_id)) {
          clickSessions.add(e.anon_session_id);
          if (!scrolled) noScroll += 1;
        }
      }
      setTotalClicks(clickSessions.size);
      setNoScrollClicks(noScroll);
      setCtas(
        [...byCta.entries()]
          .map(([k, v]) => ({ label: CTA_LABELS[k] ?? k, people: v.size }))
          .sort((a, b) => b.people - a.people),
      );

      // Conversão por origem do clique: page_view do checkout com meta.src
      const arrivedBySrc = new Map<string, Set<string>>();
      for (const e of ev) {
        if (e.step !== "page_view") continue;
        const src = String(((e.meta ?? {}) as Record<string, unknown>).src ?? "");
        if (!src || !e.anon_session_id) continue;
        if (!arrivedBySrc.has(src)) arrivedBySrc.set(src, new Set());
        arrivedBySrc.get(src)!.add(e.anon_session_id);
      }
      const paidSessions = new Set(
        ev
          .filter((e) => e.step === "pix_authorized" && e.anon_session_id)
          .map((e) => e.anon_session_id),
      );
      setSrcPaid(
        [...arrivedBySrc.entries()]
          .map(([src, sessions]) => ({
            src: CTA_LABELS[src] ?? src,
            arrived: sessions.size,
            paid: [...sessions].filter((s) => paidSessions.has(s)).length,
          }))
          .sort((a, b) => b.arrived - a.arrived),
      );

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
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">
          Engajamento da landing /v2 · {monthLabel}
        </CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setMonthOffset((m) => m - 1)}>
            ◀
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={monthOffset >= 0}
            onClick={() => setMonthOffset((m) => Math.min(0, m + 1))}
          >
            ▶
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 text-sm">
        {loading ? (
          <p className="text-muted-foreground">Carregando…</p>
        ) : views === 0 ? (
          <p className="text-muted-foreground">
            Sem dados neste mês. A medição começa a valer a partir da publicação da instrumentação.
          </p>
        ) : (
          <>
            <div>
              <p className="text-muted-foreground mb-2">
                {views} pessoas abriram a landing
              </p>
              <div className="space-y-1.5">
                {depths.map((d) => (
                  <div key={d.label} className="flex items-center gap-3">
                    <span className="w-24 text-muted-foreground">{d.label}</span>
                    <div className="flex-1 h-2 rounded bg-muted overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${d.pct}%` }} />
                    </div>
                    <span className="w-24 text-right tabular-nums">
                      {d.people} · {d.pct}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="font-medium mb-2">Cliques por posição na página</p>
              {ctas.length === 0 ? (
                <p className="text-muted-foreground">Nenhum clique registrado.</p>
              ) : (
                <ul className="space-y-1">
                  {ctas.map((c) => (
                    <li key={c.label} className="flex justify-between">
                      <span className="text-muted-foreground">{c.label}</span>
                      <span className="tabular-nums">{c.people}</span>
                    </li>
                  ))}
                </ul>
              )}
              {totalClicks > 0 && (
                <p className="mt-2 text-muted-foreground">
                  Clicaram sem rolar nada:{" "}
                  <strong className="text-foreground">
                    {noScrollClicks} de {totalClicks} (
                    {Math.round((noScrollClicks / totalClicks) * 100)}%)
                  </strong>
                </p>
              )}
            </div>

            <div>
              <p className="font-medium mb-2">Chegou no checkout por origem</p>
              {srcPaid.length === 0 ? (
                <p className="text-muted-foreground">Sem origem marcada ainda.</p>
              ) : (
                <ul className="space-y-1">
                  {srcPaid.map((r) => (
                    <li key={r.src} className="flex justify-between">
                      <span className="text-muted-foreground">{r.src}</span>
                      <span className="tabular-nums">
                        {r.arrived} chegaram · {r.paid} autorizaram PIX
                      </span>
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
