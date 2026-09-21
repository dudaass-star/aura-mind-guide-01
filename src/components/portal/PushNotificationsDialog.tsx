import { useEffect, useState } from "react";
import { Bell, BellOff, ExternalLink, Loader2, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { disablePushNotifications, enablePushNotifications, getPushPermission, isIosPushInstallRequired, type PushActivationResult } from "@/lib/push-notifications";
import { supabasePortal } from "@/integrations/supabase/portal-client";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstallNeeded: () => void;
};

const messages: Record<Exclude<PushActivationResult["status"], "registered">, string> = {
  "not-configured": "As notificações ainda não estão disponíveis. Tente novamente mais tarde.",
  unsupported: "Este navegador não aceita notificações. Abra a AURA no Safari ou Chrome atualizado.",
  "open-in-new-tab": "Abra a AURA em uma aba própria ou pelo aplicativo instalado para ativar.",
  denied: "A permissão está bloqueada. Abra as configurações deste site no navegador e permita notificações.",
  "install-first": "No iPhone, primeiro adicione a AURA à Tela de Início. Depois, abra pelo ícone e volte aqui.",
  error: "Não foi possível ativar agora. Aguarde um instante e tente novamente.",
};

export function PushNotificationsDialog({ open, onOpenChange, onInstallNeeded }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PushActivationResult | null>(null);
  const permission = typeof window === "undefined" ? "unsupported" : getPushPermission();
  const enabled = permission === "granted" && localStorage.getItem("aura-push-enabled") === "true";

  useEffect(() => {
    if (open) {
      setResult(null);
      void supabasePortal.functions.invoke("register-push-device", { body: { action: "event", eventType: "invite_shown" } });
    }
  }, [open]);

  const activate = async () => {
    setLoading(true);
    void supabasePortal.functions.invoke("register-push-device", { body: { action: "event", eventType: "activation_started" } });
    const next = await enablePushNotifications();
    setResult(next);
    setLoading(false);
  };

  const disable = async () => {
    setLoading(true);
    await disablePushNotifications();
    setLoading(false);
    onOpenChange(false);
  };

  const status = result?.status;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-lg border-border bg-background p-6 shadow-card">
        <DialogHeader className="text-left">
          <span className="mb-2 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {enabled ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
          </span>
          <DialogTitle className="font-display text-2xl text-foreground">
            {enabled ? "Notificações ativadas" : "Não perca o que importa"}
          </DialogTitle>
          <DialogDescription className="pt-1 font-body leading-relaxed">
            {enabled
              ? "Este aparelho pode avisar sobre respostas, sessões e jornadas da AURA."
              : "Ative para receber respostas da AURA e lembretes importantes, mesmo com o aplicativo fechado."}
          </DialogDescription>
        </DialogHeader>

        {status && status !== "registered" && (
          <div className="rounded-lg border border-border bg-secondary/60 p-3 text-sm leading-relaxed text-foreground" role="status">
            {messages[status]}
          </div>
        )}
        {status === "registered" && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-foreground" role="status">
            Pronto. A AURA poderá avisar você neste aparelho.
          </div>
        )}

        <div className="mt-2 space-y-2">
          {!enabled && status !== "registered" && (
            <Button type="button" className="h-11 w-full font-body" onClick={() => void activate()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
              Ativar notificações
            </Button>
          )}
          {status === "install-first" && isIosPushInstallRequired() && (
            <Button type="button" variant="outline" className="h-11 w-full font-body" onClick={onInstallNeeded}>
              <ExternalLink className="h-4 w-4" /> Ver como instalar
            </Button>
          )}
          {status === "open-in-new-tab" && (
            <Button type="button" variant="outline" className="h-11 w-full font-body" onClick={() => window.open(window.location.href, "_blank", "noopener,noreferrer")}>
              <ExternalLink className="h-4 w-4" /> Abrir em nova aba
            </Button>
          )}
          {status === "denied" && (
            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"><Settings className="mt-0.5 h-3.5 w-3.5 shrink-0" />Depois de permitir nas configurações, volte e toque em ativar novamente.</p>
          )}
          {enabled && (
            <Button type="button" variant="ghost" className="h-10 w-full font-body text-muted-foreground" onClick={() => void disable()} disabled={loading}>
              Desativar neste aparelho
            </Button>
          )}
          <Button type="button" variant="ghost" className="h-10 w-full font-body text-muted-foreground" onClick={() => onOpenChange(false)}>
            {status === "registered" || enabled ? "Concluir" : "Agora não"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
