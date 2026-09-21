import { useEffect, useState } from "react";
import { Download, Share2, SquarePlus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || ("standalone" in window.navigator && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone));
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
    || (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
}

export function InstallAppMenuItem() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => isStandalone());
  const [showIosGuide, setShowIosGuide] = useState(false);
  const ios = isIosDevice();

  useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)");
    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };
    const handleDisplayMode = () => setInstalled(isStandalone());

    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);
    media.addEventListener("change", handleDisplayMode);
    return () => {
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      media.removeEventListener("change", handleDisplayMode);
    };
  }, []);

  if (installed || (!installPrompt && !ios)) return null;

  const handleInstall = async () => {
    if (ios) {
      setShowIosGuide(true);
      return;
    }
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstallPrompt(null);
  };

  return (
    <>
      <DropdownMenuItem
        onSelect={(event) => {
          event.preventDefault();
          void handleInstall();
        }}
        className="gap-3 px-3 py-3 font-body"
      >
        <Download className="h-4 w-4" />
        <span>Instalar aplicativo</span>
      </DropdownMenuItem>

      <Dialog open={showIosGuide} onOpenChange={setShowIosGuide}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-lg border-border bg-background p-6 shadow-card">
          <DialogHeader className="text-left">
            <DialogTitle className="font-display text-xl text-foreground">Instalar a AURA no iPhone</DialogTitle>
            <DialogDescription className="pt-1 font-body leading-relaxed">
              Faça isso no Safari para deixar a AURA na sua tela inicial.
            </DialogDescription>
          </DialogHeader>
          <ol className="space-y-4 pt-2 font-body text-sm text-foreground">
            <li className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-primary"><Share2 className="h-4 w-4" /></span>
              <span className="pt-1.5">Toque em <strong>Compartilhar</strong> na barra do Safari.</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-primary"><SquarePlus className="h-4 w-4" /></span>
              <span className="pt-1.5">Escolha <strong>Adicionar à Tela de Início</strong> e confirme.</span>
            </li>
          </ol>
        </DialogContent>
      </Dialog>
    </>
  );
}