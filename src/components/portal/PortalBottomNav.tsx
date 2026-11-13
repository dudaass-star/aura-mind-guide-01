import { useState } from "react";
import { BookOpen, CalendarDays, Compass, Headphones, HeartHandshake, Home, MessageCircle, Moon, Sparkles, Sun, UserRound } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

export type NavTarget = "inicio" | "conversar" | "sessoes" | "insights" | "explorar";
type ExploreArea = "hoje" | "oracoes" | "meditacoes" | "jornadas" | "movimento" | "sobre";

const EXPLORE: { tab: ExploreArea; label: string; detail: string; icon: React.ElementType }[] = [
  { tab: "hoje", label: "Hoje", detail: "O que te acompanha agora", icon: Sun },
  { tab: "oracoes", label: "Orações", detail: "Um momento com Deus", icon: Moon },
  { tab: "meditacoes", label: "Meditações", detail: "Pausas guiadas", icon: Headphones },
  { tab: "jornadas", label: "Jornadas", detail: "Conteúdos para você", icon: BookOpen },
  { tab: "movimento", label: "Movimento", detail: "Algo maior", icon: HeartHandshake },
  { tab: "sobre", label: "Sobre você", detail: "Sua história reunida", icon: UserRound },
];

const ITEMS: { id: NavTarget; label: string; icon: React.ElementType }[] = [
  { id: "inicio", label: "Início", icon: Home },
  { id: "conversar", label: "Conversar", icon: MessageCircle },
  { id: "sessoes", label: "Sessões", icon: CalendarDays },
  { id: "insights", label: "Percurso", icon: Sparkles },
  { id: "explorar", label: "Explorar", icon: Compass },
];

type Props = { active: NavTarget; onSelect: (target: Exclude<NavTarget, "explorar">) => void; onExplore: (tab: ExploreArea) => void };

/** Barra fixa do rodapé: navegação em um toque entre as áreas principais do App. */
export function PortalBottomNav({ active, onSelect, onExplore }: Props) {
  const [exploreOpen, setExploreOpen] = useState(false);
  return (
    <>
      <nav aria-label="Navegação principal" className="portal-bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-card/95 backdrop-blur-xl" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <ul className="mx-auto grid max-w-2xl grid-cols-5">
          {ITEMS.map(({ id, label, icon: Icon }) => {
            const isActive = active === id;
            return (
              <li key={id}>
                <button
                  type="button"
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => (id === "explorar" ? setExploreOpen(true) : onSelect(id))}
                  className={cn("flex w-full flex-col items-center gap-1 py-2 text-[11px] transition-colors", isActive ? "font-bold text-foreground" : "font-medium text-muted-foreground")}
                >
                  <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", isActive && "bg-primary/15 text-primary")}>
                    <Icon className="h-5 w-5" strokeWidth={1.7} />
                  </span>
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      <Drawer open={exploreOpen} onOpenChange={setExploreOpen}>
        <DrawerContent className="pb-[max(1rem,env(safe-area-inset-bottom))]">
          <DrawerTitle className="px-5 pt-2 font-display text-xl">Explorar</DrawerTitle>
          <div className="grid grid-cols-2 gap-3 p-5">
            {EXPLORE.map(({ tab, label, detail, icon: Icon }) => (
              <button key={tab} type="button" onClick={() => { setExploreOpen(false); onExplore(tab); }} className="rounded-2xl border border-border/60 bg-secondary/40 p-4 text-left">
                <Icon className="h-5 w-5 text-primary" />
                <span className="mt-2 block text-sm font-semibold text-foreground">{label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{detail}</span>
              </button>
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
