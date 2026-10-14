import { CalendarClock, MessageCircleHeart, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  open: boolean;
  firstName?: string;
  onStartNow: () => void;
  onSchedule: () => void;
  onExplore: () => void;
}

// Boas-vindas da degustação: o lead chega na tela inicial e escolhe como viver o primeiro encontro.
export function DegustacaoWelcomeDialog({ open, firstName, onStartNow, onSchedule, onExplore }: Props) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onExplore(); }}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader className="text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Boas-vindas{firstName ? `, ${firstName}` : ""}</p>
          <DialogTitle className="font-display text-2xl leading-tight">Seu primeiro encontro de 45 minutos está liberado</DialogTitle>
          <DialogDescription className="text-base text-foreground/75">
            Um momento só seu, sem pressa, com começo, meio e fim. A AURA escuta, conecta o que você conta e ajuda você a enxergar o próximo passo.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2 space-y-3">
          <Button className="h-12 w-full gap-2 text-base" onClick={onStartNow}>
            <MessageCircleHeart className="h-5 w-5" /> Iniciar encontro agora
          </Button>
          <Button variant="outline" className="h-12 w-full gap-2 text-base" onClick={onSchedule}>
            <CalendarClock className="h-5 w-5" /> Prefiro agendar um horário
          </Button>
          <button type="button" onClick={onExplore} className="w-full py-1 text-sm text-muted-foreground underline-offset-4 hover:underline">
            Explorar o app primeiro
          </button>
        </div>
        <div className="mt-2 flex gap-3 rounded-xl bg-secondary/60 p-3 text-sm text-foreground/80">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <p>Seu acesso fica guardado com segurança, sem senha para lembrar. Para voltar, entre com seu e-mail ou use o link que enviamos no seu WhatsApp.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
