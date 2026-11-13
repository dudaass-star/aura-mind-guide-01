import { useState } from "react";
import { BookOpen, ChevronRight, CalendarDays, Compass, Headphones, HeartHandshake, Home, MessageCircle, Moon, Sparkles, Sun, UserRound } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import prayerImage from "@/assets/prayer-night.jpg";
import meditationImage from "@/assets/v3/hero-mulher-noite.jpg";

const FEATURED_MEDIA: Partial<Record<string, { image: string; tag: string }>> = {
  oracoes: { image: prayerImage, tag: "Voz da AURA" },
  meditacoes: { image: meditationImage, tag: "3 a 10 min" },
};

export type NavTarget = "inicio" | "conversar" | "sessoes" | "insights" | "explorar";
type ExploreArea = "hoje" | "oracoes" | "meditacoes" | "jornadas" | "movimento" | "sobre";

const EXPLORE: { tab: ExploreArea; label: string; detail: string; icon: React.ElementType }[] = [
  { tab: "hoje", label: "Hoje", detail: "O que te acompanha agora", icon: Sun },
  { tab: "oracoes", label: "Orações", detail: "Um momento com Deus, na voz da AURA", icon: Moon },
  { tab: "meditacoes", label: "Meditações", detail: "Pausas guiadas para respirar e voltar a si", icon: Headphones },
  { tab: "jornadas", label: "Jornadas", detail: "Conteúdos para você", icon: BookOpen },
  { tab: "movimento", label: "Movimento", detail: "Algo maior", icon: HeartHandshake },
  { tab: "sobre", label: "Sobre você", detail: "Sua história reunida", icon: UserRound },
];

/** Práticas de retenção ganham vitrine no topo do Explorar. */
const FEATURED: ExploreArea[] = ["oracoes", "meditacoes"];

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
      <nav aria-label="Navegação principal" className="portal-bottom-nav fixed inset-x-3 z-40 mx-auto max-w-md rounded-full" style={{ bottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
        <ul className="grid grid-cols-5 px-1.5 py-1">
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
        <DrawerContent className="portal-explore-sheet pb-[max(1rem,env(safe-area-inset-bottom))]">
          <DrawerTitle className="px-5 pt-2 font-display text-xl">Explorar</DrawerTitle>
          <div className="space-y-3 px-5 pt-4">
            {EXPLORE.filter((e) => FEATURED.includes(e.tab)).map(({ tab, label, detail, icon: Icon }) => (
              <button key={tab} type="button" onClick={() => { setExploreOpen(false); onExplore(tab); }} className="portal-explore-featured flex w-full items-center gap-4 rounded-2xl border p-3 text-left">
                <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl">
                  <img src={FEATURED_MEDIA[tab]?.image} alt="" className="h-full w-full object-cover" loading="lazy" />
                  <span className="portal-explore-thumb-icon absolute bottom-1 right-1 flex h-6 w-6 items-center justify-center rounded-full"><Icon className="h-3.5 w-3.5" /></span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="portal-practice-tag mb-1 inline-block rounded-full px-2 py-0.5 text-[9px] font-semibold">{FEATURED_MEDIA[tab]?.tag}</span>
                  <span className="block font-display text-base font-semibold text-foreground">{label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{detail}</span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-primary" />
              </button>
            ))}
          </div>
          <p className="px-5 pt-5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Outras áreas</p>
          <div className="grid grid-cols-2 gap-3 px-5 pb-5 pt-2">
            {EXPLORE.filter((e) => !FEATURED.includes(e.tab)).map(({ tab, label, detail, icon: Icon }) => (
              <button key={tab} type="button" onClick={() => { setExploreOpen(false); onExplore(tab); }} className="portal-explore-tile rounded-2xl border p-4 text-left">
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
