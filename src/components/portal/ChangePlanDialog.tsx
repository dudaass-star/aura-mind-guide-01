import { useState } from "react";
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

type PlanId = "essencial" | "direcao" | "transformacao";
type BillingCycle = "monthly" | "yearly";

interface PlanInfo {
  id: PlanId;
  name: string;
  tagline: string;
  priceMonthly: number;
  priceYearly: number; // mensal equivalente quando cobrado anualmente
}

const PLANS: PlanInfo[] = [
  {
    id: "essencial",
    name: "Essencial",
    tagline: "Apoio do dia a dia, no seu ritmo.",
    priceMonthly: 29.9,
    priceYearly: 24.9,
  },
  {
    id: "direcao",
    name: "Direção",
    tagline: "Mais profundidade e sessões frequentes.",
    priceMonthly: 49.9,
    priceYearly: 39.9,
  },
  {
    id: "transformacao",
    name: "Transformação",
    tagline: "Acompanhamento completo, sem limites.",
    priceMonthly: 79.9,
    priceYearly: 64.9,
  },
];

function fmt(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  currentPlan: PlanId | null;
}

export function ChangePlanDialog({ open, onOpenChange, userId, currentPlan }: Props) {
  const [billing, setBilling] = useState<BillingCycle>("monthly");
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

  const selectedPlan = PLANS.find((p) => p.id === selected) ?? null;
  const currentPlanInfo = PLANS.find((p) => p.id === currentPlan) ?? null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-['Nunito']">Trocar de plano</DialogTitle>
          <DialogDescription className="font-['Nunito']">
            A diferença proporcional é cobrada (ou creditada) automaticamente.
          </DialogDescription>
        </DialogHeader>

        {!confirming && (
          <>
            {/* Toggle mensal/anual */}
            <div className="flex justify-center mb-2">
              <div className="inline-flex rounded-full border border-border p-1 bg-muted/30">
                {(["monthly", "yearly"] as BillingCycle[]).map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setBilling(b)}
                    className={`px-4 py-1.5 text-xs rounded-full font-['Nunito'] transition-colors ${
                      billing === b
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {b === "monthly" ? "Mensal" : "Anual"}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2.5">
              {PLANS.map((p) => {
                const isCurrent = p.id === currentPlan;
                const isSelected = p.id === selected;
                const price = billing === "monthly" ? p.priceMonthly : p.priceYearly;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => !isCurrent && setSelected(p.id)}
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
                          <span className="font-semibold font-['Nunito']">{p.name}</span>
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
                          {p.tagline}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-semibold font-['Nunito']">
                          {fmt(price)}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-['Nunito']">
                          /mês{billing === "yearly" ? " (anual)" : ""}
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

        {confirming && selectedPlan && (
          <>
            <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm font-['Nunito'] space-y-2">
              <div>
                <span className="text-muted-foreground">De:</span>{" "}
                <span className="font-medium">
                  {currentPlanInfo?.name ?? "Plano atual"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Para:</span>{" "}
                <span className="font-medium">
                  {selectedPlan.name} ({billing === "monthly" ? "mensal" : "anual"}) ·{" "}
                  {fmt(billing === "monthly" ? selectedPlan.priceMonthly : selectedPlan.priceYearly)}
                  /mês
                </span>
              </div>
              <p className="text-xs text-muted-foreground pt-1">
                A cobrança proporcional acontece hoje, no cartão já cadastrado.
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