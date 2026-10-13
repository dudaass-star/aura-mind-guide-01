import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, CreditCard, Loader2, QrCode, ShieldCheck, Sparkles } from "lucide-react";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import { DEGUSTACAO_PLANS, type DegustacaoPlanId, type DegustacaoReason } from "@/lib/degustacao";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const HEADLINES: Record<DegustacaoReason, { title: string; body: string }> = {
  session_end: { title: "Seu próximo passo já tem lugar", body: "Escolha seu plano para manter o próximo encontro e seguir conversando com a AURA sempre que precisar." },
  session: { title: "A AURA está pronta para te receber", body: "Ative seu plano para entrar no seu encontro agora mesmo." },
  chat: { title: "Converse sempre que precisar", body: "Com um plano ativo, a conversa com a AURA fica aberta todos os dias, junto com seus encontros." },
  prayer: { title: "Todas as orações, sempre com você", body: "Sua oração de cortesia já foi usada. Ative um plano para ouvir todas, quando quiser." },
  meditation: { title: "Todas as meditações, sempre com você", body: "Sua meditação de cortesia já foi usada. Ative um plano para ouvir todas, quando quiser." },
  manual: { title: "Continue sua jornada com a AURA", body: "Escolha o plano que acompanha o seu ritmo." },
};

type Cycle = "monthly" | "quarterly" | "semestral" | "yearly";
// Preços por ciclo iguais ao checkout principal (/v2/checkout).
const CYCLE_PRICES: Record<DegustacaoPlanId, Record<Cycle, number>> = {
  essencial: { monthly: 29.9, quarterly: 59.7, semestral: 89.4, yearly: 118.8 },
  direcao: { monthly: 49.9, quarterly: 101.7, semestral: 149.4, yearly: 202.8 },
  transformacao: { monthly: 79.9, quarterly: 161.7, semestral: 239.4, yearly: 322.8 },
};
const CYCLES: { id: Cycle; label: string; months: number; period: string }[] = [
  { id: "monthly", label: "Mensal", months: 1, period: "mês" },
  { id: "quarterly", label: "Trimestral", months: 3, period: "trimestre" },
  { id: "semestral", label: "Semestral", months: 6, period: "semestre" },
  { id: "yearly", label: "Anual", months: 12, period: "ano" },
];

const onlyDigits = (s: string) => s.replace(/\D/g, "");
const maskCpf = (s: string) => onlyDigits(s).slice(0, 11)
  .replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");

type Pix = { qrCodeImage?: string; copyPaste?: string; amount?: number };

export function DegustacaoPlansDialog({ open, onOpenChange, reason, userId, onActivated }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason: DegustacaoReason;
  userId: string;
  onActivated: () => void;
}) {
  const queryClient = useQueryClient();
  const [plan, setPlan] = useState<DegustacaoPlanId>("direcao");
  const [cpf, setCpf] = useState("");
  const [cycle, setCycle] = useState<Cycle>("monthly");
  const cycleInfo = CYCLES.find((c) => c.id === cycle)!;
  const priceOf = (id: DegustacaoPlanId) => CYCLE_PRICES[id][cycle];
  const monthlyOf = (id: DegustacaoPlanId) => priceOf(id) / cycleInfo.months;
  const discountOf = (id: DegustacaoPlanId) => Math.round((1 - monthlyOf(id) / CYCLE_PRICES[id].monthly) * 100);
  const [method, setMethod] = useState<"pix" | "card">("pix");
  const [step, setStep] = useState<"plans" | "pix" | "card" | "done">("plans");
  const [card, setCard] = useState<{ clientSecret: string; stripe: Promise<StripeJs | null> } | null>(null);
  const [pix, setPix] = useState<Pix | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const requestKey = useRef<string>("");
  const head = HEADLINES[reason] || HEADLINES.manual;
  const selected = useMemo(() => DEGUSTACAO_PLANS.find((p) => p.id === plan)!, [plan]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (step === "done") setStep("plans");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Confirmação em tempo real: o webhook do PIX ativa o perfil; aqui só observamos.
  useEffect(() => {
    if (!open || (step !== "pix" && step !== "card")) return;
    const timer = window.setInterval(async () => {
      const { data } = await supabasePortal.from("profiles").select("status").eq("user_id", userId).maybeSingle();
      if (data?.status && data.status !== "degustacao") {
        window.clearInterval(timer);
        setStep("done");
        await queryClient.invalidateQueries({ queryKey: ["portal-profile", userId] });
        onActivated();
      }
    }, 4000);
    return () => window.clearInterval(timer);
  }, [open, step, userId, queryClient, onActivated]);

  const generatePix = async () => {
    setError(null);
    if (onlyDigits(cpf).length !== 11) { setError("Informe um CPF válido para o PIX."); return; }
    setLoading(true);
    try {
      const { data: profile } = await supabasePortal.from("profiles").select("name, email, phone").eq("user_id", userId).maybeSingle();
      if (!profile?.email) throw new Error("Não encontramos seu cadastro. Atualize a tela e tente de novo.");
      if (!requestKey.current) requestKey.current = `deg_${crypto.randomUUID().replace(/-/g, "")}`;
      const { data, error: fnError } = await supabasePortal.functions.invoke("criar-pix-recorrente-woovi", {
        body: {
          plan, billing: cycle, name: profile.name || "Cliente", email: profile.email,
          phone: profile.phone || "", cpf: onlyDigits(cpf), mode: "checkout",
          requestKey: `${requestKey.current}_${plan}_${cycle}`,
        },
      });
      if (fnError) throw new Error("Não foi possível gerar o PIX agora. Tente novamente.");
      if (data?.blocked) throw new Error(data.message || "Já existe uma assinatura com esses dados.");
      if (data?.error) throw new Error(String(data.error));
      if (!data?.copyPaste) throw new Error("Não foi possível gerar o PIX agora. Tente novamente.");
      setPix({ qrCodeImage: data.qrCodeImage, copyPaste: data.copyPaste, amount: data.amount });
      setStep("pix");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível gerar o PIX agora.");
    } finally {
      setLoading(false);
    }
  };

  const startCard = async () => {
    setError(null);
    setLoading(true);
    try {
      const { data: profile } = await supabasePortal.from("profiles").select("name, email, phone").eq("user_id", userId).maybeSingle();
      if (!profile?.email || !profile?.phone) throw new Error("Não encontramos seu cadastro. Atualize a tela e tente de novo.");
      const { data, error: fnError } = await supabasePortal.functions.invoke("create-checkout", {
        body: { plan, billing: cycle, trial: false, paymentMethod: "card", embedded: true, source: "degustacao",
          name: profile.name || "Cliente", email: profile.email, phone: profile.phone },
      });
      if (fnError || !data?.clientSecret || !data?.publishableKey) {
        throw new Error((data as { error?: string } | null)?.error || "Não foi possível abrir o pagamento com cartão agora.");
      }
      setCard({ clientSecret: data.clientSecret, stripe: loadStripe(data.publishableKey) });
      setStep("card");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível abrir o pagamento com cartão agora.");
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!pix?.copyPaste) return;
    await navigator.clipboard.writeText(pix.copyPaste).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        {step === "plans" && (
          <>
            <DialogHeader className="-mx-6 -mt-6 rounded-t-lg bg-gradient-to-br from-primary/20 via-accent/15 to-background px-6 pb-5 pt-7 text-left">
              <span className="mb-2 inline-flex w-fit items-center gap-1.5 rounded-full bg-background/70 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary"><Sparkles className="h-3.5 w-3.5" />Continue com a AURA</span>
              <DialogTitle className="font-display text-2xl leading-tight">{head.title}</DialogTitle>
              <DialogDescription>{head.body}</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-4 gap-1 rounded-xl border border-border bg-muted/50 p-1" role="radiogroup" aria-label="Escolha o ciclo">
              {CYCLES.map((c) => {
                const on = c.id === cycle;
                const off = c.months > 1 ? Math.round((1 - CYCLE_PRICES[plan][c.id] / c.months / CYCLE_PRICES[plan].monthly) * 100) : 0;
                return (
                  <button key={c.id} type="button" role="radio" aria-checked={on} onClick={() => { setCycle(c.id); setError(null); }}
                    className={`flex flex-col items-center gap-0.5 rounded-lg px-1 py-2 text-xs font-medium transition-all ${on ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:bg-background"}`}>
                    {c.label}
                    {off > 0 ? <span className={`rounded px-1 text-[10px] font-bold ${on ? "bg-primary-foreground/20" : "bg-accent/25 text-accent-foreground"}`}>-{off}%</span> : <span className="text-[10px] opacity-70">sem desconto</span>}
                  </button>
                );
              })}
            </div>
            <div className="space-y-3" role="radiogroup" aria-label="Escolha seu plano">
              {DEGUSTACAO_PLANS.map((p) => {
                const active = p.id === plan;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setPlan(p.id)}
                    className={`w-full rounded-lg border p-4 text-left transition-colors ${active ? "border-primary bg-gradient-to-br from-primary/15 to-accent/10 shadow-lg ring-1 ring-primary" : "border-border bg-card hover:border-primary/40"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="flex items-center gap-2 font-semibold text-foreground">
                          {p.name}
                          {p.highlight && <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-foreground">Mais escolhido</span>}
                        </p>
                        <p className="mt-0.5 text-sm text-muted-foreground">{p.sessions}</p>
                      </div>
                      <p className="whitespace-nowrap text-right font-display text-lg font-semibold text-primary">{fmt(monthlyOf(p.id))}<span className="block font-sans text-xs font-normal text-muted-foreground">{cycle === "monthly" ? "por mês" : `/mês · ${fmt(priceOf(p.id))} por ${cycleInfo.period}`}</span>{cycle !== "monthly" && discountOf(p.id) > 0 && <span className="block font-sans text-[11px] font-semibold text-primary">economize {fmt(CYCLE_PRICES[p.id].monthly * cycleInfo.months - priceOf(p.id))}</span>}</p>
                    </div>
                    <ul className="mt-2 space-y-1">
                      {p.features.map((f) => <li key={f} className="flex items-center gap-2 text-xs text-muted-foreground"><Check className="h-3.5 w-3.5 text-primary" />{f}</li>)}
                    </ul>
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Forma de pagamento">
              {([["pix", "PIX Automático", QrCode], ["card", "Cartão", CreditCard]] as const).map(([id, label, Icon]) => (
                <button key={id} type="button" role="radio" aria-checked={method === id} onClick={() => { setMethod(id); setError(null); }}
                  className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm font-medium transition-colors ${method === id ? "border-primary bg-primary/5 text-foreground ring-1 ring-primary" : "border-border bg-card text-muted-foreground hover:border-primary/40"}`}>
                  <Icon className="h-4 w-4" />{label}
                </button>
              ))}
            </div>
            {method === "pix" && <div className="space-y-1.5">
              <Label htmlFor="deg-cpf">CPF para o PIX Automático</Label>
              <Input id="deg-cpf" inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" value={cpf} onChange={(e) => setCpf(maskCpf(e.target.value))} />
            </div>}
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
            <Button size="lg" className="w-full gap-2 bg-gradient-to-r from-primary to-primary/80 shadow-lg" onClick={() => void (method === "pix" ? generatePix() : startCard())} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : method === "pix" ? <QrCode className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
              Ativar {selected.name} · {fmt(priceOf(plan))}/{cycleInfo.period}
            </Button>
            <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" />{method === "pix" ? "PIX Automático" : "Cartão"} · cancele quando quiser, sem fidelidade</p>
          </>
        )}

        {step === "card" && card && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-2xl">Pague com cartão para ativar</DialogTitle>
              <DialogDescription>{selected.name} · {fmt(priceOf(plan))} por {cycleInfo.period}. Assim que o pagamento for aprovado, tudo libera aqui mesmo.</DialogDescription>
            </DialogHeader>
            <div className="overflow-hidden rounded-lg bg-card">
              <EmbeddedCheckoutProvider key={card.clientSecret} stripe={card.stripe} options={{ clientSecret: card.clientSecret }}>
                <EmbeddedCheckout />
              </EmbeddedCheckoutProvider>
            </div>
            <Button variant="ghost" className="w-full" onClick={() => { setCard(null); setStep("plans"); }}>Trocar de plano ou forma de pagamento</Button>
          </>
        )}

        {step === "pix" && pix && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-2xl">Pague com PIX para ativar</DialogTitle>
              <DialogDescription>
                {selected.name} · {fmt(pix.amount ?? priceOf(plan))} hoje e depois a cada {cycleInfo.period}, automaticamente. Assim que o banco confirmar, tudo libera aqui mesmo.
              </DialogDescription>
            </DialogHeader>
            {pix.qrCodeImage && <img src={pix.qrCodeImage} alt="QR Code do PIX" className="mx-auto h-56 w-56 rounded-lg border border-border bg-card p-2" />}
            <Button size="lg" className="w-full gap-2" onClick={() => void copy()}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Código copiado" : "Copiar código PIX"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">Abra o app do seu banco, escolha PIX Copia e Cola e cole o código.</p>
            <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Aguardando a confirmação do banco…</p>
            <Button variant="ghost" className="w-full" onClick={() => setStep("plans")}>Trocar de plano</Button>
          </>
        )}

        {step === "done" && (
          <div className="py-6 text-center">
            <Sparkles className="mx-auto mb-3 h-10 w-10 text-primary" />
            <h2 className="font-display text-2xl font-semibold text-foreground">Tudo certo, seu plano está ativo</h2>
            <p className="mt-2 text-sm text-muted-foreground">Seu próximo encontro está mantido e a conversa com a AURA está aberta.</p>
            <Button className="mt-5" onClick={() => onOpenChange(false)}>Continuar</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
