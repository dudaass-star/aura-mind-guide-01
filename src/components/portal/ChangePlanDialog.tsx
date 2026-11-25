import { useEffect, useState } from "react";
import "@fontsource/nunito/400.css";
import "@fontsource/nunito/600.css";
import "@fontsource/nunito/700.css";
import "@fontsource/nunito/800.css";
import { Loader2, Check } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import {
  PLAN_LABELS,
  PLAN_MONTHLY_EQUIVALENT,
  CYCLE_LABELS,
  PLAN_CHANGE_CYCLES,
  planChangeInitialCycle,
  annualPlanSavings,
  fmtBRL,
  type PlanId,
  type BillingCycle,
} from "@/lib/plan-pricing";

const PLAN_IDS: PlanId[] = ["essencial", "direcao", "transformacao"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  currentPlan: PlanId | null;
  currentBilling?: BillingCycle | null;
  /** Tier de retenção ativo (lite/base). Se houver, nenhum plano cheio é "atual". */
  currentTier?: string | null;
  /** Gateway ativo — roteia para a edge function correta e ajusta copy. */
  paymentGateway: "stripe-card" | "asaas-pix" | "asaas-card" | "inter-pix" | "woovi-pix";
  minimumSessionLimit?: number;
}

const PLAN_SESSION_LIMITS: Record<PlanId, number> = { essencial: 2, direcao: 4, transformacao: 8 };

export function ChangePlanDialog({
  open,
  onOpenChange,
  userId,
  currentPlan,
  currentBilling,
  currentTier,
  paymentGateway,
  minimumSessionLimit,
}: Props) {
  const [billing, setBilling] = useState<BillingCycle>(planChangeInitialCycle(currentBilling));
  const [selected, setSelected] = useState<PlanId | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<{
    planName: string;
    nextChargeDate?: string;
    nextChargeAmount?: number;
    /** PIX Automático Bacen: valor novo exige novo QR de autorização. */
    qrCodeImage?: string | null;
    copyPaste?: string | null;
  } | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) {
      setBilling(planChangeInitialCycle(currentBilling));
      setSelected(null);
    }
  }, [open, currentBilling]);

  const isInter = paymentGateway === "inter-pix";
  // PIX Automático da Woovi: mesma natureza do Inter (mandato Bacen com valor
  // fixo). Sem entrar aqui, o retorno com QR era descartado e a troca morria
  // num toast de "plano atualizado" que não tinha acontecido (caso Cris, 09/09).
  const isWoovi = paymentGateway === "woovi-pix";
  const isPixAutomatico = isInter || isWoovi;
  const isAsaas = paymentGateway === "asaas-pix" || paymentGateway === "asaas-card";
  const isPix = paymentGateway === "asaas-pix";
  const isAsaasCard = paymentGateway === "asaas-card";
  // Mostra tela de sucesso com próxima cobrança em qualquer fluxo Asaas
  // (PIX e cartão recorrente Asaas reusam a mesma edge com retorno idêntico).
  const showsNextCharge = isAsaas || isPixAutomatico;
  const copyDescription = isPixAutomatico
    ? "No PIX Automático o valor autorizado é fixo: para trocar, você escaneia um QR novo uma única vez e paga o próximo ciclo ao autorizar."
    : isPix
    ? "A troca vale a partir da próxima cobrança PIX. Hoje não rola cobrança nenhuma."
    : isAsaasCard
      ? "A troca vale a partir da próxima cobrança no seu cartão. Hoje não rola cobrança nenhuma."
      : "A diferença é cobrada (ou creditada) hoje no cartão já cadastrado.";
  const copyConfirm = isPixAutomatico
    ? "Vou gerar um QR novo com o valor do plano escolhido. Ao autorizar no banco, o próximo ciclo é cobrado na hora e somado ao período que você já pagou. Depois disso, o débito antigo é encerrado."
    : isPix
    ? "Sua próxima cobrança PIX já vem com o novo valor. Nada é cobrado agora."
    : isAsaasCard
      ? "Sua próxima cobrança no cartão já vem com o novo valor. Nada é cobrado agora."
      : "A diferença é cobrada agora no seu cartão. Se for downgrade, vira crédito no próximo ciclo.";

  const reset = () => {
    setSelected(null);
    setConfirming(false);
    setLoading(false);
    setSuccess(null);
  };

  const handleClose = (next: boolean) => {
    if (loading) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const handleConfirm = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      const functionName = isInter
        ? "change-inter-plan"
        : isAsaas
          ? "change-asaas-plan"
          : "change-subscription-plan";
      const { data, error } = await supabasePortal.functions.invoke(functionName, {
        body: { userId, targetPlan: selected, plan: selected, billing },
      });
      if (error) {
        const msg =
          (error as any)?.context?.error ||
          (data as any)?.error ||
          error.message ||
          "Não foi possível trocar agora.";
        throw new Error(typeof msg === "string" ? msg : "Não foi possível trocar agora.");
      }
      if ((data as any)?.error) throw new Error((data as any).error);

      await queryClient.invalidateQueries({ queryKey: ["portal-profile", userId] });
      const authorizationPending = Boolean((data as any)?.copyPaste);
      void supabasePortal.from("portal_value_events").insert({
        user_id: userId,
        feature: "session",
        event_type: authorizationPending ? "upgrade_authorization_started" : "upgrade_completed",
        source: "app",
        metadata: { target_plan: selected, billing, gateway: paymentGateway },
      }).then(() => undefined);

      if (showsNextCharge) {
        // Asaas: mostra tela de sucesso com data + valor da próxima cobrança
        setSuccess({
          planName: (data as any)?.newPlanName ?? PLAN_LABELS[selected],
          nextChargeDate: (data as any)?.nextChargeDate,
          nextChargeAmount: (data as any)?.nextChargeAmount,
          qrCodeImage: (data as any)?.qrCodeImage ?? null,
          copyPaste: (data as any)?.copyPaste ?? null,
        });
        setLoading(false);
      } else {
        toast({
          title: "Plano atualizado",
          description: `Agora você está no ${(data as any)?.newPlanName ?? "novo plano"}.`,
        });
        reset();
        onOpenChange(false);
      }
    } catch (e: any) {
      toast({
        title: "Ops",
        description: e?.message ?? "Não foi possível trocar agora.",
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  const priceFor = (p: PlanId, b: BillingCycle) => PLAN_MONTHLY_EQUIVALENT[p][b];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="portal-dialog plan-change-dialog w-[calc(100%-2rem)] max-w-lg p-5 sm:p-6">
        <DialogHeader>
          <DialogTitle className="font-body text-xl font-bold">{minimumSessionLimit ? "Ter mais sessões" : "Trocar de plano"}</DialogTitle>
          <DialogDescription className="font-body">
            {minimumSessionLimit ? `Veja os planos com mais de ${minimumSessionLimit} ${minimumSessionLimit === 1 ? "sessão" : "sessões"} por mês. ${copyDescription}` : copyDescription}
          </DialogDescription>
        </DialogHeader>

        {success && (
          <>
            <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm font-body space-y-2">
              <div className="flex items-center gap-2">
                <Check size={16} className="text-accent" />
                <span className="font-semibold">
                  {success.copyPaste
                    ? `Falta um passo: autorizar o ${success.planName}.`
                    : `Plano trocado para ${success.planName}.`}
                </span>
              </div>
              {success.copyPaste && (
                <div className="space-y-3 pt-1">
                  <p className="text-muted-foreground">
                    Escaneie o QR abaixo (ou copie o código) no app do seu banco. É uma vez só:
                    ao autorizar, o próximo ciclo será cobrado e somado ao período que você já pagou.
                    Depois disso, a renovação volta a ser automática no valor novo.
                  </p>
                  {success.qrCodeImage && (
                    <img
                      src={success.qrCodeImage}
                      alt="QR Code do PIX Automático para autorizar o novo plano"
                      className="mx-auto h-44 w-44 rounded-lg bg-background p-2"
                    />
                  )}
                  <Button variant="outline"
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(success.copyPaste as string);
                      toast({ title: "Código PIX copiado" });
                    }}
                    className="w-full rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted/40"
                  >
                    Copiar código PIX
                  </Button>
                </div>
              )}
              {success.nextChargeDate && success.nextChargeAmount != null && (
                <p className="text-muted-foreground">
                  Sua próxima cobrança, no dia <strong>{success.nextChargeDate}</strong>,
                  já vem no valor novo: <strong>{fmtBRL(success.nextChargeAmount)}</strong>.
                </p>
              )}
              <p className="text-xs text-muted-foreground pt-1">
                {success.copyPaste
                   ? "O período já pago continua valendo e não será perdido."
                  : "Nada foi cobrado agora. Sua assinatura atual segue valendo até a próxima fatura."}
              </p>
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button onClick={() => handleClose(false)}>Fechar</Button>
            </DialogFooter>
          </>
        )}

        {!success && !confirming && (
          <>
            <div role="radiogroup" aria-label="Ciclo de cobrança" className="grid grid-cols-2 gap-1 rounded-full bg-secondary p-1">
                {PLAN_CHANGE_CYCLES.map((b) => (
                  <Button variant="ghost"
                    key={b}
                    type="button"
                    role="radio" aria-checked={billing === b}
                    onClick={() => { setBilling(b); setSelected(null); }}
                    className={`h-11 rounded-full px-2 text-sm font-bold ${
                      billing === b
                        ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                        : "text-foreground"
                    }`}
                  >
                    {CYCLE_LABELS[b]}
                    {b === "yearly" && <span className="rounded-full bg-background px-2 py-0.5 text-[10px] font-bold text-primary">Até −67%</span>}
                  </Button>
                ))}
            </div>

            <div role="radiogroup" aria-label="Escolha do plano" className="space-y-2.5">
              {PLAN_IDS.filter((plan) => !minimumSessionLimit || PLAN_SESSION_LIMITS[plan] > minimumSessionLimit).map((p) => {
                // Em tier de retenção (lite/base) o usuário está num preço reduzido:
                // o Essencial mensal cheio precisa continuar selecionável.
                const isCurrent =
                  !currentTier && p === currentPlan && billing === (currentBilling ?? "monthly");
                const isSelected = p === selected;
                const price = priceFor(p, billing);
                return (
                  <Button variant="ghost"
                    key={p}
                    type="button"
                    role="radio" aria-checked={isSelected}
                    onClick={() => !isCurrent && setSelected(p)}
                    disabled={isCurrent}
                    className={`block h-auto w-full whitespace-normal text-left rounded-lg border-2 p-3 transition-colors disabled:opacity-100 ${
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                        : isCurrent
                          ? "border-border bg-secondary cursor-default"
                          : "border-border bg-card hover:border-primary hover:bg-secondary"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold font-body">{PLAN_LABELS[p]}</span>
                          {isCurrent && (
                            <span className="text-[10px] uppercase tracking-wider bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                              Seu plano
                            </span>
                          )}
                          {isSelected && !isCurrent && (
                            <Check size={18} className="text-primary-foreground" />
                          )}
                        </div>
                        <p className={`text-xs mt-1 ${isSelected ? "text-primary-foreground" : "text-muted-foreground"}`}>
                          {PLAN_SESSION_LIMITS[p]} encontros/mês · {p === "essencial" ? "Quinzenal" : p === "direcao" ? "Semanal" : "2 vezes por semana"}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-lg font-extrabold">
                          {fmtBRL(price)}
                        </div>
                        <div className={`text-xs ${isSelected ? "text-primary-foreground" : "text-muted-foreground"}`}>
                          /mês
                        </div>
                      </div>
                    </div>
                    {billing === "yearly" && <div className={`mt-2 flex flex-wrap items-center justify-between gap-1 border-t pt-2 text-xs ${isSelected ? "border-primary-foreground/20 text-primary-foreground" : "border-border text-muted-foreground"}`}>
                      <span>{fmtBRL(annualPlanSavings(p).total)} por ano</span>
                      <span className={`font-bold ${isSelected ? "text-primary-foreground" : "text-primary"}`}>Economize {fmtBRL(annualPlanSavings(p).savings)} · {annualPlanSavings(p).percent}%</span>
                    </div>}
                  </Button>
                );
              })}
            </div>

            <DialogFooter className="sticky -bottom-5 z-10 bg-background py-3 gap-2 sm:gap-2 sm:-bottom-6">
              <Button variant="ghost" onClick={() => handleClose(false)}>
                Fechar
              </Button>
              <Button
                onClick={() => setConfirming(true)}
                disabled={!selected}
              >
                Continuar
              </Button>
            </DialogFooter>
          </>
        )}

        {!success && confirming && selected && (
          <>
            <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm font-body space-y-2">
              <div>
                <span className="text-muted-foreground">De:</span>{" "}
                <span className="font-medium">
                  {currentPlan ? PLAN_LABELS[currentPlan] : "Plano atual"}
                  {currentBilling ? ` (${CYCLE_LABELS[currentBilling].toLowerCase()})` : ""}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Para:</span>{" "}
                <span className="font-medium">
                  {PLAN_LABELS[selected]} ({CYCLE_LABELS[billing].toLowerCase()}) ·{" "}
                  {fmtBRL(priceFor(selected, billing))}/mês
                  {billing === "yearly" && <span className="block text-muted-foreground">{fmtBRL(annualPlanSavings(selected).total)} por ano</span>}
                </span>
              </div>
              <p className="text-xs text-muted-foreground pt-1">
                {copyConfirm}
              </p>
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                variant="ghost"
                onClick={() => setConfirming(false)}
                disabled={loading}
              >
                Voltar
              </Button>
              <Button onClick={handleConfirm} disabled={loading}>
                {loading && <Loader2 size={14} className="animate-spin mr-2" />}
                Confirmar troca
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}