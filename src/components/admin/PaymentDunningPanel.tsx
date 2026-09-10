import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, CheckCircle2, CreditCard, MessageSquare, RefreshCw, Send, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Periodo = "7" | "30";
type Provedor = "todos" | "woovi" | "asaas" | "stripe";

type DunningAttempt = {
  id: string;
  profile_user_id: string | null;
  phone_resolved: string | null;
  phone_raw: string | null;
  provider: string | null;
  channel: string | null;
  attempt_number: number | null;
  offer_tier: string | null;
  offer_accepted: boolean | null;
  whatsapp_sent: boolean;
  delivery_status: string | null;
  error_stage: string | null;
  error_message: string | null;
  created_at: string;
};

const PROVIDER_LABELS: Record<string, string> = { woovi: "Woovi", asaas: "Asaas", stripe: "Cartão" };
const OFFER_LABELS: Record<string, string> = {
  recover_card: "Atualizar pagamento",
  discount_30: "30% de desconto",
  lite: "Plano Essencial",
  base: "Plano gratuito",
};

function personKey(row: DunningAttempt) {
  return row.profile_user_id || row.phone_resolved || row.phone_raw || row.id;
}

function deliveryLabel(row: DunningAttempt) {
  if (row.error_stage || ["failed", "undelivered"].includes(row.delivery_status || "")) return "Falhou";
  if (row.channel === "email") return row.whatsapp_sent ? "Enviado" : "Não enviado";
  if (row.delivery_status === "read") return "Lido";
  if (row.delivery_status === "delivered") return "Entregue";
  if (row.whatsapp_sent) return "Enviado";
  return "Não enviado";
}

function StatusBadge({ row }: { row: DunningAttempt }) {
  const label = deliveryLabel(row);
  if (label === "Falhou" || label === "Não enviado") return <Badge variant="destructive" className="text-[10px]">{label}</Badge>;
  if (label === "Entregue" || label === "Lido") return <Badge className="bg-emerald-600 text-primary-foreground text-[10px]">{label}</Badge>;
  return <Badge variant="secondary" className="text-[10px]">{label}</Badge>;
}

export default function PaymentDunningPanel() {
  const [periodo, setPeriodo] = useState<Periodo>("7");
  const [provedor, setProvedor] = useState<Provedor>("todos");
  const [rows, setRows] = useState<DunningAttempt[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const since = new Date(Date.now() - Number(periodo) * 86_400_000).toISOString();
      let query = supabase.from("dunning_attempts")
        .select("id, profile_user_id, phone_resolved, phone_raw, provider, channel, attempt_number, offer_tier, offer_accepted, whatsapp_sent, delivery_status, error_stage, error_message, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (provedor !== "todos") query = query.eq("provider", provedor);
      const { data, error } = await query;
      if (error) throw error;
      const attempts = (data || []) as DunningAttempt[];
      setRows(attempts);

      const ids = [...new Set(attempts.map((row) => row.profile_user_id).filter(Boolean))] as string[];
      if (!ids.length) { setNames({}); return; }
      const { data: profiles } = await supabase.from("profiles").select("user_id, name").in("user_id", ids);
      setNames(Object.fromEntries((profiles || []).map((profile) => [profile.user_id, profile.name || "Cliente"])));
    } catch (error) {
      console.error("Erro ao carregar disparos de cobrança:", error);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [periodo, provedor]);

  useEffect(() => { void load(); }, [load]);

  const metrics = useMemo(() => ({
    people: new Set(rows.map(personKey)).size,
    sent: rows.filter((row) => row.whatsapp_sent && !row.error_stage).length,
    delivered: rows.filter((row) => ["delivered", "read"].includes(row.delivery_status || "")).length,
    failed: rows.filter((row) => deliveryLabel(row) === "Falhou").length,
    accepted: new Set(rows.filter((row) => row.offer_accepted).map(personKey)).size,
  }), [rows]);

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base font-semibold"><CreditCard className="h-4 w-4" />Disparos de cobrança</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Régua de pagamentos falhos, separada da recuperação de checkout abandonado.</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={periodo} onValueChange={(value) => setPeriodo(value as Periodo)}>
              <SelectTrigger className="h-8 w-[116px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="7">7 dias</SelectItem><SelectItem value="30">30 dias</SelectItem></SelectContent>
            </Select>
            <Select value={provedor} onValueChange={(value) => setProvedor(value as Provedor)}>
              <SelectTrigger className="h-8 w-[126px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="todos">Todos</SelectItem><SelectItem value="woovi">Woovi</SelectItem><SelectItem value="asaas">Asaas</SelectItem><SelectItem value="stripe">Cartão</SelectItem></SelectContent>
            </Select>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => void load()} disabled={loading} title="Atualizar">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {[
            { label: "Pessoas acionadas", value: metrics.people, icon: Users },
            { label: "Mensagens enviadas", value: metrics.sent, icon: Send },
            { label: "Entregas confirmadas", value: metrics.delivered, icon: CheckCircle2 },
            { label: "Falhas de entrega", value: metrics.failed, icon: AlertCircle },
            { label: "Ofertas aceitas", value: metrics.accepted, icon: CreditCard },
          ].map((item) => <div key={item.label} className="rounded-md border bg-muted/20 p-3"><item.icon className="mb-2 h-4 w-4 text-muted-foreground" /><p className="text-xl font-semibold tabular-nums">{item.value}</p><p className="text-[11px] text-muted-foreground">{item.label}</p></div>)}
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Pessoa</TableHead><TableHead>Origem</TableHead><TableHead>Canal</TableHead><TableHead>Degrau</TableHead><TableHead>Situação</TableHead><TableHead>Conversa</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.slice(0, 100).map((row) => {
                const phone = row.phone_resolved || row.phone_raw;
                const person = row.profile_user_id ? names[row.profile_user_id] : null;
                return <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-xs">{new Date(row.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</TableCell>
                  <TableCell className="text-xs"><span className="block font-medium">{person || "Sem perfil"}</span><span className="text-muted-foreground">{phone ? `${phone.slice(0, 6)}***` : "—"}</span></TableCell>
                  <TableCell className="text-xs">{PROVIDER_LABELS[row.provider || ""] || row.provider || "—"}</TableCell>
                  <TableCell className="text-xs">{row.channel === "email" ? "E-mail" : "WhatsApp"}</TableCell>
                  <TableCell className="text-xs">{OFFER_LABELS[row.offer_tier || ""] || (row.attempt_number ? `${row.attempt_number}º aviso` : "Aviso")}</TableCell>
                  <TableCell className="text-xs"><StatusBadge row={row} />{row.offer_accepted && <Badge variant="outline" className="ml-1 text-[10px]">Aceita</Badge>}{row.error_message && <p className="mt-1 max-w-[220px] truncate text-[10px] text-muted-foreground" title={row.error_message}>{row.error_message}</p>}</TableCell>
                  <TableCell className="text-xs">
                    {row.profile_user_id
                      ? <Button asChild variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]"><Link to={`/admin/mensagens?user=${row.profile_user_id}`}><MessageSquare className="h-3 w-3" />Abrir</Link></Button>
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                </TableRow>;
              })}
              {!loading && rows.length === 0 && <TableRow><TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">Nenhum disparo no período.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
        {rows.length > 100 && <p className="text-center text-xs text-muted-foreground">Mostrando os 100 disparos mais recentes de {rows.length}.</p>}
      </CardContent>
    </Card>
  );
}