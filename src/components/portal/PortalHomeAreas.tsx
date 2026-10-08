import { ArrowRight, BookOpen, CalendarDays, ChevronRight, Headphones, HeartHandshake, Moon, Sparkles, Sun, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import prayerImage from "@/assets/prayer-night.jpg";
import meditationImage from "@/assets/v3/hero-mulher-noite.jpg";
import movementImage from "@/assets/movimento-grupo-abraco-logo-real.jpg";
import { cn } from "@/lib/utils";

export type HomeArea = "hoje" | "sessoes" | "insights" | "oracoes" | "meditacoes" | "jornadas" | "sobre" | "movimento";
type Props = { onNavigate: (area: HomeArea) => void; onPrefetch?: (area: HomeArea) => void; hasJoinedMovement: boolean; movementIsNew: boolean };
const groups = [
  { title: "Seu acompanhamento", areas: [
    { label: "Hoje", detail: "O que te acompanha agora", tab: "hoje", icon: Sun, tone: "portal-area-today" },
    { label: "Sessões", detail: "Seus encontros com a AURA", tab: "sessoes", icon: CalendarDays, tone: "portal-area-sessions" },
    { label: "Percurso", detail: "O que vem mudando", tab: "insights", icon: Sparkles, tone: "portal-area-journey" },
  ] },
  { title: "Para explorar", areas: [
    { label: "Jornadas", detail: "Conteúdos para acompanhar você", tab: "jornadas", icon: BookOpen, tone: "portal-area-content" },
    { label: "Sobre você", detail: "Sua história reunida", tab: "sobre", icon: UserRound, tone: "portal-area-profile" },
  ] },
] as const;
const practices = [
  { label: "Orações", detail: "Um momento com Deus.", action: "Encontre sua oração", tab: "oracoes", image: prayerImage, alt: "Um lago tranquilo ao anoitecer", icon: Moon, tone: "portal-area-journey" },
  { label: "Meditações", detail: "Pausas guiadas para você.", action: "Escolha sua pausa", tab: "meditacoes", image: meditationImage, alt: "Um momento tranquilo ao fim do dia", icon: Headphones, tone: "portal-area-audio" },
] as const;

export function PortalHomeAreas({ onNavigate, onPrefetch, hasJoinedMovement, movementIsNew }: Props) {
  const access = (area: HomeArea) => ({ onClick: () => onNavigate(area), onPointerEnter: () => onPrefetch?.(area), onFocus: () => onPrefetch?.(area), onTouchStart: () => onPrefetch?.(area) });
  const renderGroup = (group: typeof groups[number]) => (
    <section key={group.title} aria-label={group.title}>
      <h2 className="mb-3 text-[17px] font-medium text-foreground">{group.title}</h2>
      <div className="divide-y divide-border/40 border-y border-border/60">
        {group.areas.map(({ label, detail, tab, icon: Icon, tone }) => (
          <Button key={tab} type="button" variant="ghost" {...access(tab)} aria-label={`Abrir ${label}`} className="group h-auto min-h-[66px] w-full justify-start gap-3 rounded-none px-0.5 py-2.5 text-left hover:bg-card">
            <span className={cn("flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg", tone)}><Icon className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1 whitespace-normal"><span className="block text-sm font-semibold text-foreground">{label}</span><span className="mt-1 block text-xs font-normal leading-relaxed text-muted-foreground">{detail}</span></span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Button>
        ))}
      </div>
    </section>
  );
  return (
    <div className="space-y-7">
      {renderGroup(groups[0])}
      <section aria-label="Um momento para você">
        <h2 className="mb-3 text-[17px] font-medium text-foreground">Um momento para você</h2>
        <div className="grid grid-cols-2 gap-3">
          {practices.map(({ label, detail, action, tab, image, alt, icon: Icon, tone }) => (
            <Button key={tab} type="button" variant="ghost" {...access(tab)} aria-label={`Abrir ${label}`} className={cn("group block h-auto min-w-0 overflow-hidden rounded-lg p-0 text-left whitespace-normal hover:opacity-90", tone)}>
              <img src={image} alt={alt} className="aspect-[1.85/1] w-full object-cover" loading="lazy" />
              <span className="block p-3"><span className="flex min-h-6 items-center gap-1.5"><Icon className="h-4 w-4 shrink-0" /><span className="font-display text-base font-medium">{label}</span></span><span className="mt-2 block min-h-9 text-xs font-normal leading-[18px]">{detail}</span><span className="mt-3 flex min-h-5 items-center justify-between gap-1 text-[11px] font-semibold"><span>{action}</span><ArrowRight className="h-4 w-4 shrink-0" /></span></span>
            </Button>
          ))}
        </div>
      </section>
      {renderGroup(groups[1])}
      <section aria-label="Faça parte de algo maior">
        <h2 className="mb-3 text-[17px] font-medium text-foreground">Faça parte de algo maior</h2>
        <article className="overflow-hidden rounded-lg portal-area-journey">
          <img src={movementImage} alt="Pessoas abraçadas com camisetas do Movimento Olá Aura" className="aspect-[2.8/1] w-full object-cover" loading="lazy" />
          <div className="p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase"><HeartHandshake className="h-4 w-4" /><span>Movimento Olá Aura</span>{movementIsNew && !hasJoinedMovement && <span className="rounded-full bg-primary px-2 py-0.5 text-[9px] text-primary-foreground">Novo</span>}</div>
            <h3 className="text-xl font-medium leading-tight text-foreground">Mais gente. Mais apoio.<br />Um movimento de todos nós.</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-secondary-foreground">Para que mais pessoas encontrem apoio e não precisem enfrentar tudo sozinhas.</p>
            <Button type="button" {...access("movimento")} className="mt-4 h-auto min-h-10 w-full justify-between gap-3 rounded-md py-2.5 text-[13px] whitespace-normal">{hasJoinedMovement ? "Meu lugar no Movimento" : "Conhecer o Movimento"}<ArrowRight className="h-4 w-4 shrink-0" /></Button>
          </div>
        </article>
      </section>
    </div>
  );
}
