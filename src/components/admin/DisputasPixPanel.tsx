import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// Painel das disputas de PIX (MED) do trilho Woovi.
//
// Por que existe: disputa MED sem resposta é decidida contra nós e deixa marca
// de fraude na conta — acumulado, isso desabilita a conta Woovi. A defesa é
// enviada automaticamente pelo webhook; aqui só se confere se saiu, com que
// veredito e quantas disputas temos por 100 pagamentos de PIX.

type Dispute = {
  id: string;
  dispute_id: string;
  dispute_type: string | null;
  status: string | null;
  end_to_end_id: string | null;
  customer_name: string | null;
  value_cents: number | null;
  defense_decision: string | null;
  evidence_sent_at: string | null;
  evidence_error: string | null;
  evidence_attempts: number | null;
  resolution: string | null;
  created_at: string;
};

const money = (cents?: number | null) =>
  typeof cents === "number" ? `R$ ${(cents / 100).toFixed(2).replace(".", ",")}` : "—";

const brt = (v?: string | null) =>
  v
    ? new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(v))
    : "—";

export default function DisputasPixPanel() {
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<Dispute[]>([]);
  const [paidCount, setPaidCount] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [{ data }, { count }] = await Promise.all([
      supabase
        .from("woovi_disputes")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("woovi_charges")
        .select("id", { count: "exact", head: true })
        .in("status", ["COMPLETED", "PAID", "CONFIRMED"]),
    ]);
    setRows((data as Dispute[]) || []);
    setPaidCount(Number(count || 0));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function rodarDefesa() {
    setRunning(true);
    setAviso(null);
    const { data, error } = await supabase.functions.invoke("woovi-dispute-defense", { body: {} });
    setAviso(
      error
        ? `Falhou: ${error.message}`
        : `Tratadas ${(data as any)?.processed ?? 0} disputa(s).`,
    );
    setRunning(false);
    load();
  }

  const abertas = rows.filter((r) => !r.resolution);
  const semDefesa = abertas.filter((r) => !r.evidence_sent_at && r.defense_decision !== "refund_suggested");
  const por100 = paidCount > 0 ? ((rows.length / paidCount) * 100).toFixed(2) : "0,00";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Disputas de PIX (MED)</CardTitle>
        <Button size="sm" variant="outline" onClick={rodarDefesa} disabled={running}>
          {running ? "Enviando…" : "Rodar defesa agora"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Disputas registradas</p>
            <p className="text-xl font-semibold">{rows.length}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Em aberto</p>
            <p className="text-xl font-semibold">{abertas.length}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Sem defesa enviada</p>
            <p className="text-xl font-semibold">{semDefesa.length}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Por 100 pagamentos</p>
            <p className="text-xl font-semibold">{por100}</p>
          </div>
        </div>

        {aviso && <p className="text-xs text-muted-foreground">{aviso}</p>}

        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma disputa registrada.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.id} className="rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{r.customer_name || "Cliente não identificado"}</span>
                  <Badge variant="outline">{r.dispute_type || "MED"}</Badge>
                  <Badge variant="outline">{money(r.value_cents)}</Badge>
                  {r.resolution ? (
                    <Badge variant={r.resolution === "WON" ? "default" : "destructive"}>{r.resolution}</Badge>
                  ) : (
                    <Badge variant="secondary">{r.status || "aberta"}</Badge>
                  )}
                  {r.evidence_sent_at ? (
                    <Badge variant="default">defesa enviada {brt(r.evidence_sent_at)}</Badge>
                  ) : r.defense_decision === "refund_suggested" ? (
                    <Badge variant="secondary">devolução sugerida</Badge>
                  ) : (
                    <Badge variant="destructive">sem defesa</Badge>
                  )}
                </div>
                <p className="mt-1 break-all text-xs text-muted-foreground">
                  Abertura {brt(r.created_at)} · e2e {r.end_to_end_id || "—"} · tentativas {r.evidence_attempts ?? 0}
                </p>
                {r.evidence_error && (
                  <p className="mt-1 text-xs text-destructive">{r.evidence_error}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
