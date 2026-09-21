import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function isAppStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || ("standalone" in window.navigator && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone));
}

export function isIosDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
    || (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
}

export function useInstallApp() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => isAppStandalone());
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
      localStorage.setItem("aura-app-installed", "true");
    };
    const handleDisplayMode = () => setInstalled(isAppStandalone());

    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);
    media.addEventListener("change", handleDisplayMode);
    return () => {
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      media.removeEventListener("change", handleDisplayMode);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstallPrompt(null);
  };

  return {
    available: !installed && (Boolean(installPrompt) || ios),
    installed,
    ios,
    install,
  };
}

export function InstallAppMenuItem({
  available,
  ios,
  onInstall,
  onShowIosGuide,
}: {
  available: boolean;
  ios: boolean;
  onInstall: () => Promise<void>;
  onShowIosGuide: () => void;
}) {
  if (!available) return null;

  const handleInstall = async () => {
    if (ios) onShowIosGuide();
    else await onInstall();
  };

  return (
    <DropdownMenuItem onSelect={() => void handleInstall()} className="gap-3 px-3 py-3 font-body">
      <Download className="h-4 w-4" />
      <span>Instalar aplicativo</span>
    </DropdownMenuItem>
  );
}