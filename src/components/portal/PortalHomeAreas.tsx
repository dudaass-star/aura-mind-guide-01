import { ArrowRight, BookOpen, CalendarDays, ChevronRight, Headphones, HeartHandshake, Moon, Sparkles, Sun, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import prayerImage from "@/assets/prayer-night.jpg";
import meditationImage from "@/assets/v3/hero-mulher-noite.jpg";
import movementImage from "@/assets/movimento-grupo-abraco-logo-real.jpg";
import { trackMovement, useMovementVisibility } from "@/lib/movement-analytics";
import { cn } from "@/lib/utils";

export type HomeArea = "hoje" | "sessoes" | "insights" | "oracoes" | "meditacoes" | "jornadas" | "sobre" | "movimento";
type Props = { onNavigate: (area: HomeArea) => void; onPrefetch?: (area: HomeArea) => void; hasJoinedMovement: boolean; movementIsNew: boolean; isActive?: boolean };
const groups = [
  { title: "Seu acompanhamento", areas: [
    { label: "Hoje", detail: "O que te acompanha agora", tab: "hoje", icon: Sun, tone: "portal-area-today" },
    { label: "Sessões", detail: "Seus encontros com a AURA", tab: "sessoes", icon: CalendarDays, tone: "portal-area-sessions" },
    { label: "Seu Percurso", detail: "O que vem mudando", tab: "insights", icon: Sparkles, tone: "portal-area-journey" },
    { label: "Sobre você", detail: "Sua história reunida", tab: "sobre", icon: UserRound, tone: "portal-area-profile" },
  ] },
  { title: "Para explorar", areas: [
    { label: "Jornadas", detail: "Conteúdos para acompanhar você", tab: "jornadas", icon: BookOpen, tone: "portal-area-content" },
  ] },
] as const;
const practices = [
  { label: "Orações", detail: "Um momento com Deus.", tag: "Voz da AURA", action: "Ouvir", tab: "oracoes", image: prayerImage, alt: "Um lago tranquilo ao anoitecer", icon: Moon, tone: "portal-practice-prayer" },
  { label: "Meditações", detail: "Pausas guiadas para você.", tag: "3 a 10 min", action: "Respirar", tab: "meditacoes", image: meditationImage, alt: "Um momento tranquilo ao fim do dia", icon: Headphones, tone: "portal-practice-meditation" },
] as const;

export function PortalHomeAreas({ onNavigate, onPrefetch, hasJoinedMovement, movementIsNew, isActive = true }: Props) {
  const trackingRef = useMovementVisibility("app", isActive, "home_viewed");
  const access = (area: HomeArea) => ({ onClick: () => { if (area === "movimento") trackMovement("card_clicked", "app"); onNavigate(area); }, onPointerEnter: () => onPrefetch?.(area), onFocus: () => onPrefetch?.(area), onTouchStart: () => onPrefetch?.(area) });
  const renderGroup = (group: typeof groups[number]) => (
    <section key={group.title} aria-label={group.title}>
      <h2 className="mb-3 text-[17px] font-medium text-foreground">{group.title}</h2>
      <div className="portal-home-list divide-y divide-border/40 overflow-hidden">
        {group.areas.map(({ label, detail, tab, icon: Icon }) => (
          <Button key={tab} type="button" variant="ghost" {...access(tab)} aria-label={`Abrir ${label}`} className="group h-auto min-h-[66px] w-full justify-start gap-3 rounded-none px-3.5 py-2.5 text-left hover:bg-secondary/40">
            <span className="portal-home-icon flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full"><Icon className="h-[18px] w-[18px]" strokeWidth={1.6} /></span>
            <span className="min-w-0 flex-1 whitespace-normal"><span className="block text-sm font-semibold text-foreground">{label}</span><span className="mt-1 block text-xs font-normal leading-relaxed text-muted-foreground">{detail}</span></span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Button>
        ))}
      </div>
    </section>
  );
  return (
    <div ref={trackingRef} className="space-y-7">
      <Button type="button" variant="ghost" {...access("hoje")} aria-label="Abrir Hoje" className="portal-home-feature group h-auto w-full justify-start gap-3 rounded-2xl px-4 py-3.5 text-left whitespace-normal hover:bg-transparent hover:text-[hsl(40_25%_96%)]">
        <span className="portal-practice-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-full"><Sun className="h-5 w-5" strokeWidth={1.6} /></span>
        <span className="min-w-0 flex-1"><span className="block text-[10px] font-semibold uppercase tracking-wide opacity-70">Seu momento</span><span className="block text-[15px] font-semibold">Hoje com a AURA</span><span className="mt-0.5 block text-xs opacity-75">O que te acompanha agora</span></span>
        <ChevronRight className="h-4 w-4 shrink-0 opacity-70 transition-transform group-hover:translate-x-0.5" />
      </Button>
      <section aria-label="Um momento para você">
        <h2 className="mb-3 text-[17px] font-medium text-foreground">Um momento para você</h2>
        <div className="grid grid-cols-2 gap-3">
          {practices.map(({ label, detail, tag, action, tab, image, alt, icon: Icon, tone }) => (
            <Button key={tab} type="button" variant="ghost" {...access(tab)} aria-label={`Abrir ${label}`} className={cn("portal-practice group hover:bg-transparent hover:text-[hsl(40_25%_96%)] focus-visible:text-[hsl(40_25%_96%)] relative block h-auto aspect-[3/4] min-w-0 overflow-hidden rounded-3xl p-0 text-left whitespace-normal", tone)}>
              <img src={image} alt={alt} className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy" />
              <span className="portal-practice-veil absolute inset-0" aria-hidden />
              <span className="portal-practice-tag absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-semibold">{tag}</span>
              <span className="absolute inset-x-0 bottom-0 block p-3.5">
                <span className="portal-practice-icon mb-2 flex h-8 w-8 items-center justify-center rounded-full"><Icon className="h-4 w-4" /></span>
                <span className="block font-display text-lg font-semibold leading-tight">{label}</span>
                <span className="mt-1 block text-xs leading-snug opacity-80">{detail}</span>
                <span className="portal-practice-cta mt-3 inline-flex items-center gap-1 text-[11px] font-semibold">{action}<ArrowRight className="h-3.5 w-3.5" /></span>
              </span>
            </Button>
          ))}
        </div>
      </section>
      <section aria-label="Jornadas">
        <h2 className="mb-3 text-[17px] font-medium text-foreground">Para se aprofundar</h2>
        <Button type="button" variant="ghost" {...access("jornadas")} aria-label="Abrir Jornadas" className="portal-home-feature portal-home-journeys group h-auto w-full justify-start gap-3 rounded-2xl px-4 py-4 text-left whitespace-normal hover:bg-transparent hover:text-[hsl(40_25%_96%)]">
          <span className="portal-practice-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-full"><BookOpen className="h-5 w-5" strokeWidth={1.6} /></span>
          <span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold">Jornadas</span><span className="mt-0.5 block text-xs leading-snug opacity-75">8 trilhas com 8 episódios: ansiedade, autoconfiança, relacionamentos e mais.</span></span>
          <ChevronRight className="h-4 w-4 shrink-0 opacity-70 transition-transform group-hover:translate-x-0.5" />
        </Button>
      </section>
      <section aria-label="Faça parte de algo maior">
        <h2 className="mb-3 text-[17px] font-medium text-foreground">Faça parte de algo maior</h2>
        <article data-movement-event="card_viewed" className="overflow-hidden rounded-2xl shadow-sm portal-area-journey">
          <img src={movementImage} alt="Pessoas abraçadas com camisetas do Movimento Olá Aura" className="aspect-[2.8/1] w-full object-cover" loading="lazy" />
          <div className="p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase"><HeartHandshake className="h-4 w-4" /><span>Movimento Olá Aura</span>{movementIsNew && !hasJoinedMovement && <span className="rounded-full bg-primary px-2 py-0.5 text-[9px] text-primary-foreground">Novo</span>}</div>
            <h3 className="text-xl font-medium leading-tight text-foreground">Lembrou de alguém que está passando por um momento difícil?</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-secondary-foreground">Faça parte do Movimento e leve esse apoio para quem você ama. Ninguém deveria enfrentar tudo sozinho.</p>
            <Button type="button" {...access("movimento")} className="mt-4 h-auto min-h-10 w-full justify-between gap-3 rounded-md py-2.5 text-[13px] whitespace-normal">{hasJoinedMovement ? "Meu lugar no Movimento" : "Fazer parte do Movimento"}<ArrowRight className="h-4 w-4 shrink-0" /></Button>
          </div>
        </article>
      </section>
    </div>
  );
}
