import type { ReactNode } from "react";
import { ArrowLeft, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import logoOlaAura from "@/assets/logo-ola-aura.png";

type JourneyPageShellProps = {
  children: ReactNode;
  eyebrow: string;
  title: string;
  backHref?: string;
};

export function JourneyPageShell({ children, eyebrow, title, backHref = "/meu-espaco?tab=jornadas" }: JourneyPageShellProps) {
  return (
    <div className="portal-chat-theme portal-app-theme portal-app-area-jornadas portal-journey-page flex min-h-screen flex-col bg-background text-foreground">
      <header className="portal-app-header sticky top-0 z-30 border-b border-border/70 bg-card/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-5">
          <Button variant="ghost" size="icon" asChild className="h-11 w-11 shrink-0 rounded-full">
            <a href={backHref} aria-label="Voltar para Jornadas">
              <ArrowLeft className="h-5 w-5" />
            </a>
          </Button>
          <span className="portal-area-content flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
            <BookOpen className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</p>
            <h1 className="truncate font-display text-xl font-semibold leading-tight text-foreground">{title}</h1>
          </div>
          <img src={logoOlaAura} alt="Olá AURA" className="h-7 w-auto opacity-75" />
        </div>
      </header>
      {children}
    </div>
  );
}