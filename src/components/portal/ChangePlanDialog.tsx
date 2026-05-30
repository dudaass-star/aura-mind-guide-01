import { useState } from "react";
import { Loader2, Check, Info } from "lucide-react";
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
  PLAN_TAGLINES,
  PLAN_MONTHLY_EQUIVALENT,
  CYCLE_LABELS,
  fmtBRL,
  type PlanId,
  type BillingCycle,
} from "@/lib/plan-pricing";

const PLAN_IDS: PlanId[] = ["essencial", "direcao", "transformacao"];
const CYCLES: BillingCycle[] = ["monthly", "quarterly", "semiannual", "yearly"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  currentPlan: PlanId | null;
  currentBilling?: BillingCycle | null;
  /** Quando true, usuário está em PIX Asaas recorrente — troca não é self-service. */
  isAsaasPix?: boolean;
}

export function ChangePlanDialog({
  open,
  onOpenChange,
  userId,
  currentPlan,
  currentBilling,
  isAsaasPix,
}: Props) {
  const [billing, setBilling] = useState<BillingCycle>(currentBilling ?? "monthly");
  const [selected, setSelected] = useState<PlanId | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const reset = () => {
    setSelected(null);
    setConfirming(false);
    setLoading(false);
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
      const { data, error } = await supabasePortal.functions.invoke(
        "change-subscription-plan",
        { body: { userId, targetPlan: selected, billing } },
      );
      if (error) {
        const msg =
          (error as any)?.context?.error ||
          (data as any)?.error ||
          error.message ||
          "Não foi possível trocar agora.";
        throw new Error(typeof msg === "string" ? msg : "Não foi possível trocar agora.");
      }
      if ((data as any)?.error) throw new Error((data as any).error);

      toast({
        title: "Plano atualizado",
        description: `Agora você está no ${(data as any)?.newPlanName ?? "novo plano"}.`,
      });
      await queryClient.invalidateQueries({ queryKey: ["portal-profile", userId] });
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: "Ops",
        description: e?.message ?? "Não foi possível trocar agora.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const priceFor = (p: PlanId, b: BillingCycle) => PLAN_MONTHLY_EQUIVALENT[p][b];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-['Nunito']">Trocar de plano</DialogTitle>
          <DialogDescription className="font-['Nunito']">
            A diferença é cobrada (ou creditada) hoje no cartão já cadastrado.
          </DialogDescription>
        </DialogHeader>

        {isAsaasPix && (
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm font-['Nunito'] space-y-3">
            <div className="flex items-start gap-2">
              <Info size={16} className="mt-0.5 text-accent shrink-0" />
              <p>
                Sua assinatura é <strong>PIX recorrente</strong>. Pra trocar de plano,
                fala com a gente no WhatsApp que a gente ajeita pra você — leva uns minutinhos.
              </p>
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="ghost" onClick={() => handleClose(false)}>
                Fechar
              </Button>
              <Button asChild>
                <a
                  href="https://wa.me/16625255005?text=Quero%20trocar%20meu%20plano%20(PIX)"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Falar no WhatsApp
                </a>
              </Button>
            </DialogFooter>
          </div>
        )}

        {!isAsaasPix && !confirming && (
          <>
            {/* Toggle de ciclo (4 opções) */}
            <div className="flex justify-center mb-2">
              <div className="inline-flex flex-wrap justify-center rounded-full border border-border p-1 bg-muted/30">
                {CYCLES.map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setBilling(b)}
                    className={`px-3 py-1.5 text-xs rounded-full font-['Nunito'] transition-colors ${
                      billing === b
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {CYCLE_LABELS[b]}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2.5">
              {PLAN_IDS.map((p) => {
                const isCurrent = p === currentPlan && billing === (currentBilling ?? "monthly");
                const isSelected = p === selected;
                const price = priceFor(p, billing);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => !isCurrent && setSelected(p)}
                    disabled={isCurrent}
                    className={`w-full text-left rounded-lg border p-3 transition-all ${
                      isSelected
                        ? "border-accent ring-2 ring-accent/30 bg-accent/5"
                        : isCurrent
                          ? "border-border/40 bg-muted/30 cursor-default"
                          : "border-border hover:border-accent/60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold font-['Nunito']">{PLAN_LABELS[p]}</span>
                          {isCurrent && (
                            <span className="text-[10px] uppercase tracking-wider bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                              Seu plano
                            </span>
                          )}
                          {isSelected && !isCurrent && (
                            <Check size={14} className="text-accent" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground font-['Nunito'] mt-0.5">
                          {PLAN_TAGLINES[p]}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-semibold font-['Nunito']">
                          {fmtBRL(price)}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-['Nunito']">
                          /mês{billing !== "monthly" ? ` (${CYCLE_LABELS[billing].toLowerCase()})` : ""}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="ghost" onClick={() => handleClose(false)}>
                Cancelar
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

        {!isAsaasPix && confirming && selected && (
          <>
            <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm font-['Nunito'] space-y-2">
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
                </span>
              </div>
              <p className="text-xs text-muted-foreground pt-1">
                A diferença é cobrada agora no seu cartão. Se for downgrade, vira crédito no próximo ciclo.
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