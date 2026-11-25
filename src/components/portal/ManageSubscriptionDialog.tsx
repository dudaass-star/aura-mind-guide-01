import { ChevronRight, CreditCard, Loader2, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface SubscriptionSummary {
  planName: string;
  detail?: string;
  paymentLabel: string;
}

// Central da assinatura no App: abre na hora com o perfil já carregado.
// Cancelamento só aparece como escolha ativa no rodapé, nunca como ponto de partida.
export function ManageSubscriptionDialog({
  open,
  onOpenChange,
  summary,
  billingLabel,
  billingLoading,
  canCancel,
  onOpenBilling,
  onChangePlan,
  onCancel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: SubscriptionSummary;
  billingLabel: string;
  billingLoading?: boolean;
  canCancel: boolean;
  onOpenBilling: () => void;
  onChangePlan: () => void;
  onCancel: () => void;
}) {
  const actions = [
    { label: billingLabel, icon: billingLoading ? Loader2 : CreditCard, spin: billingLoading, onClick: onOpenBilling },
    { label: "Trocar de plano", icon: RefreshCw, onClick: () => { onOpenChange(false); onChangePlan(); } },
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="portal-dialog w-[calc(100%-2rem)] max-w-sm p-6">
        <DialogHeader className="text-left">
          <DialogTitle className="font-display text-xl font-semibold">Sua assinatura</DialogTitle>
          <DialogDescription>Tudo sobre o seu plano, num só lugar.</DialogDescription>
        </DialogHeader>
        <div className="rounded-2xl bg-primary/10 p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Plano atual</p>
          <p className="mt-1 font-display text-lg font-semibold text-foreground">{summary.planName}</p>
          {summary.detail && <p className="mt-0.5 text-sm text-muted-foreground">{summary.detail}</p>}
          <p className="mt-2 text-xs text-muted-foreground">Pagamento: {summary.paymentLabel}</p>
        </div>
        <div className="space-y-2">
          {actions.map(({ label, icon: Icon, spin, onClick }) => (
            <button key={label} type="button" onClick={onClick} disabled={billingLoading && spin}
              className="flex w-full items-center gap-3 rounded-2xl bg-foreground/5 px-4 py-3.5 text-left font-body text-sm font-semibold text-foreground transition-colors hover:bg-foreground/10 disabled:opacity-60">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background/80">
                <Icon className={spin ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              </span>
              <span className="flex-1">{label}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>
        {canCancel && (
          <p className="pt-1 text-center text-xs text-muted-foreground">
            Precisa dar uma pausa ou encerrar?{" "}
            <Button type="button" variant="link" className="h-auto p-0 text-xs text-muted-foreground underline" onClick={onCancel}>
              Pausar ou cancelar
            </Button>
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
