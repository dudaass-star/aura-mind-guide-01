import { useEffect, useState } from "react";
import { Bell, ExternalLink, Loader2, Settings, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { enablePushNotifications, isIosPushInstallRequired, type PushActivationResult } from "@/lib/push-notifications";
import { supabasePortal } from "@/integrations/supabase/portal-client";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReady: () => void;
}

// Situações em que o aparelho não consegue receber avisos: não travamos a pessoa.
const TECHNICAL_BLOCKS: PushActivationResult["status"][] = ["unsupported", "not-configured", "error"];

/**
 * Etapa obrigatória da degustação: o encontro gratuito só começa depois de
 * ativar os avisos no aparelho, canal sem custo usado na conversão seguinte.
 */
export function DegustacaoPushGateDialog({ open, onOpenChange, onReady }: Props) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<PushActivationResult["status"] | null>(null);
  const iosInstall = typeof window !== "undefined" && isIosPushInstallRequired();

  useEffect(() => {
    if (!open) return;
    setStatus(iosInstall ? "install-first" : null);
    void supabasePortal.functions.invoke("register-push-device", { body: { action: "event", eventType: "invite_shown", notificationType: "degustacao_gate" } });
  }, [open, iosInstall]);

  const activate = async () => {
    if (window.top !== window.self) {
      window.open(window.location.href, "_blank", "noopener,noreferrer");
      return;
    }
    setLoading(true);
    void supabasePortal.functions.invoke("register-push-device", { body: { action: "event", eventType: "activation_started", notificationType: "degustacao_gate" } });
    const result = await enablePushNotifications();
    setLoading(false);
    setStatus(result.status);
    if (result.status === "registered") {
      onOpenChange(false);
      onReady();
    }
  };

  const technicalBlock = status !== null && TECHNICAL_BLOCKS.includes(status);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader className="text-left">
          <span className="mb-2 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary"><Bell className="h-5 w-5" /></span>
          <DialogTitle className="font-display text-2xl leading-tight">Ative os avisos para começar</DialogTitle>
          <DialogDescription className="text-base text-foreground/75">
            A AURA avisa neste aparelho quando a sala do seu encontro abrir, para você não perder o início nem os próximos encontros. Sem spam, só o que importa.
          </DialogDescription>
        </DialogHeader>

        {status === "install-first" && (
          <div className="space-y-2 rounded-xl bg-secondary/60 p-3 text-sm text-foreground/85" role="status">
            <p className="font-semibold">No iPhone, os avisos só funcionam pelo ícone na Tela de Início:</p>
            <p className="flex items-center gap-2">1. Toque em <Share className="h-4 w-4 text-primary" /> Compartilhar, no Safari.</p>
            <p>2. Escolha “Adicionar à Tela de Início”.</p>
            <p>3. Abra o Olá Aura pelo novo ícone e entre com seu e-mail.</p>
          </div>
        )}
        {status === "denied" && (
          <p className="flex items-start gap-2 rounded-xl bg-secondary/60 p-3 text-sm text-foreground/85" role="status">
            <Settings className="mt-0.5 h-4 w-4 shrink-0" />
            Os avisos estão bloqueados. Toque no cadeado ao lado do endereço do site, permita notificações e toque em ativar de novo.
          </p>
        )}
        {status === "open-in-new-tab" && (
          <p className="rounded-xl bg-secondary/60 p-3 text-sm text-foreground/85" role="status">Abra o Olá Aura em uma aba própria para ativar.</p>
        )}
        {technicalBlock && (
          <p className="rounded-xl bg-secondary/60 p-3 text-sm text-foreground/85" role="status">Este navegador não consegue receber avisos agora. Você pode começar mesmo assim.</p>
        )}

        <div className="mt-2 space-y-2">
          {status !== "install-first" && !technicalBlock && (
            <Button className="h-12 w-full gap-2 text-base" onClick={() => void activate()} disabled={loading}>
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : window.top !== window.self ? <ExternalLink className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
              Ativar avisos e começar
            </Button>
          )}
          {technicalBlock && (
            <Button className="h-12 w-full text-base" onClick={() => { onOpenChange(false); onReady(); }}>Começar meu encontro</Button>
          )}
          {status === "install-first" && (
            <button type="button" onClick={() => { onOpenChange(false); onReady(); }} className="w-full py-1 text-xs text-muted-foreground underline-offset-4 hover:underline">
              Não consigo instalar agora, começar assim mesmo
            </button>
          )}
          <Button variant="ghost" className="h-10 w-full text-muted-foreground" onClick={() => onOpenChange(false)}>Voltar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
