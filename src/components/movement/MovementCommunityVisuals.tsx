import { Heart, HeartHandshake, Leaf, MessageCircle, Quote, Sprout, Star, Users } from "lucide-react";
import movementGroupImage from "@/assets/movimento-grupo-abraco-logo-real.jpg";

export type MuralStory = { id: string; title: string; body: string; member_name: string };

export function MovementMemberOpening({ ambassador }: { ambassador: boolean }) {
  return <section className="overflow-hidden">
    <img src={movementGroupImage} alt="Pessoas abraçadas com camisetas da Olá Aura" className="aspect-[16/9] w-full object-cover sm:aspect-[21/9]" />
    <div className="bg-primary px-5 py-7 text-primary-foreground sm:px-8">
      <p className="text-xs font-bold uppercase">Você faz parte{ambassador ? " / Embaixador" : ""}</p>
      <h2 className="mt-3 font-display text-3xl font-semibold leading-tight sm:text-4xl">O Movimento também é seu.</h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-primary-foreground/90 sm:text-base">Gente que acolhe. Histórias que aproximam. Um gesto que pode abrir um novo começo.</p>
    </div>
  </section>;
}

export function MovementCommunityMural({ stories }: { stories: MuralStory[] }) {
  return <section aria-label="Mural do Movimento">
    <h3 className="font-display text-2xl font-semibold sm:text-3xl">Mural do Movimento</h3>
    <p className="mt-2 text-sm text-muted-foreground">Pequenos gestos. Histórias que merecem ser vistas.</p>
    {stories.length > 0 ? <div className="mt-5 grid gap-4 sm:grid-cols-2">{stories.slice(0, 4).map((story, index) => <article key={story.id} className={`rounded-lg border border-border border-l-4 border-l-primary bg-card p-5 ${index === 0 ? "sm:col-span-2 sm:p-7" : ""}`}>
      <p className="text-xs font-bold uppercase text-primary">{story.member_name}</p>
      <Quote className="mt-4 h-6 w-6 text-primary" aria-hidden="true" />
      <h4 className="mt-2 font-display text-xl font-semibold sm:text-2xl">{story.title}</h4>
      <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{story.body}</p>
    </article>)}</div> : <div className="mt-5 flex gap-4 border-l-4 border-primary bg-card px-5 py-6">
      <Sprout className="mt-1 h-7 w-7 shrink-0 text-primary" />
      <div><p className="font-display text-xl font-semibold">As primeiras histórias ainda estão sendo construídas.</p><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Este espaço cresce com as vozes de quem faz parte.</p></div>
    </div>}
    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="bg-[hsl(var(--portal-journey))] p-5"><p className="text-xs font-bold uppercase text-[hsl(var(--portal-journey-foreground))]">Pertencimento</p><p className="mt-2 font-display text-xl font-semibold">Um lugar para ser ouvido.</p></div>
      <div className="bg-[hsl(var(--portal-sessions))] p-5"><p className="text-xs font-bold uppercase text-[hsl(var(--portal-sessions-foreground))]">Um novo começo</p><p className="mt-2 font-display text-xl font-semibold">Um convite pode fazer diferença.</p></div>
    </div>
    <p className="mt-3 text-xs text-muted-foreground">No Mural, só histórias autorizadas por quem foi reconhecido.</p>
  </section>;
}

const achievementIcons = { member: Leaf, cause: Heart, connected: Users, first: MessageCircle, circle: HeartHandshake, growing: Sprout, continues: Leaf, multiplies: Users, voice: Star };
const achievementTones = ["bg-[hsl(var(--portal-journey))] text-[hsl(var(--portal-journey-foreground))]", "bg-[hsl(var(--portal-today))] text-[hsl(var(--portal-today-foreground))]", "bg-[hsl(var(--portal-sessions))] text-[hsl(var(--portal-sessions-foreground))]"];

export function MovementAchievementSymbol({ id, index }: { id: string; index: number }) {
  const Icon = achievementIcons[id as keyof typeof achievementIcons] || Star;
  return <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${achievementTones[index % achievementTones.length]}`}><Icon className="h-6 w-6" aria-hidden="true" /></span>;
}