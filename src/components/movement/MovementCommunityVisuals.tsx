import { Heart, HeartHandshake, Leaf, MessageCircle, Quote, Sprout, Star, Users } from "lucide-react";
import movementGroupImage from "@/assets/movimento-grupo-abraco-logo-real.jpg";

export type MuralStory = { id: string; title: string; body: string; member_name: string };

export function MovementMemberOpening({ ambassador }: { ambassador: boolean }) {
  return <section className="overflow-hidden">
    <img src={movementGroupImage} alt="Pessoas abraçadas com camisetas da Olá Aura" className="aspect-[16/9] w-full object-cover sm:aspect-[21/9]" />
    <div className="bg-primary px-5 py-7 text-primary-foreground sm:px-8">
      <p className="text-xs font-bold uppercase">Nosso Movimento</p>
      <h2 className="mt-3 font-display text-3xl font-semibold leading-tight sm:text-4xl">Você faz parte de algo que vai além de você.</h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-primary-foreground/90 sm:text-base">Estamos juntos para que apoio, compreensão e direção cheguem a mais pessoas.</p>
      <p className="mt-5 text-xs font-semibold text-primary-foreground/90">Seu lugar aqui: {ambassador ? "Embaixador" : "Participante"}. Seu pertencimento não depende de indicações.</p>
    </div>
    <div className="grid sm:grid-cols-2">
      <div className="bg-[hsl(var(--portal-journey))] p-5 text-[hsl(var(--portal-journey-foreground))] sm:p-7"><HeartHandshake className="h-6 w-6" aria-hidden="true" /><h3 className="mt-3 font-display text-xl font-semibold">Eu faço parte</h3><p className="mt-2 text-sm leading-relaxed">Apoiar essa causa, acompanhar e se reconhecer nela já é ter um lugar aqui.</p></div>
      <div className="bg-[hsl(var(--portal-sessions))] p-5 text-[hsl(var(--portal-sessions-foreground))] sm:p-7"><Users className="h-6 w-6" aria-hidden="true" /><h3 className="mt-3 font-display text-xl font-semibold">Eu multiplico</h3><p className="mt-2 text-sm leading-relaxed">Quem escolhe ser Embaixador também pode abrir esse caminho para outras pessoas.</p></div>
    </div>
  </section>;
}

export function MovementCollectiveProgress({ snapshot }: { snapshot: { members: number; started: number; continued: number } | null }) {
  return <section aria-label="Construção coletiva">
    <p className="text-xs font-bold uppercase text-primary">Uma causa compartilhada</p>
    <h3 className="mt-2 font-display text-2xl font-semibold sm:text-3xl">O que estamos construindo juntos</h3>
    {snapshot && snapshot.members >= 10 ? <>
      <div className="mt-5 grid gap-4 border-y border-border py-5 sm:grid-cols-3">{[{ value: snapshot.members, title: "Pessoas no Movimento", text: "Gente que acredita nessa mesma causa." }, { value: snapshot.started, title: "Primeiras conversas", text: "Convites que se tornaram um começo de conversa." }, { value: snapshot.continued, title: "Pessoas que continuaram", text: "Começos que seguiram com acompanhamento." }].map(({ value, title, text }) => <div key={title}><p className="font-display text-3xl font-semibold text-primary">{value}</p><p className="mt-2 text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</p></div>)}</div>
      <p className="mt-3 text-xs text-muted-foreground">Nosso impacto coletivo, sem expor a identidade de ninguém.</p>
    </> : <div className="mt-5 flex items-start gap-4 border-y border-border py-6"><Sprout className="mt-1 h-7 w-7 shrink-0 text-primary" aria-hidden="true" /><div><p className="font-display text-xl font-semibold">As primeiras pessoas abrem caminho.</p><p className="mt-2 text-sm leading-relaxed text-muted-foreground">O Movimento está começando. Cada presença ajuda a dar forma a essa causa, mesmo sem compartilhar convites.</p><p className="mt-3 text-xs leading-relaxed text-muted-foreground">Os números coletivos aparecem a partir de 10 participantes, preservando a privacidade de todos.</p></div></div>}
  </section>;
}

export function MovementCommunityMural({ stories }: { stories: MuralStory[] }) {
  return <section aria-label="Mural do Movimento">
    <p className="text-xs font-bold uppercase text-primary">Mural do Movimento</p>
    <h3 className="mt-2 font-display text-2xl font-semibold sm:text-3xl">Histórias que nos conectam</h3>
    <p className="mt-2 text-sm text-muted-foreground">Uma causa em comum. Diferentes formas de fazer parte.</p>
    {stories.length > 0 ? <div className="mt-5 grid gap-4 sm:grid-cols-2">{stories.slice(0, 4).map((story, index) => <article key={story.id} className={`rounded-lg border border-border border-l-4 border-l-primary bg-card p-5 ${index === 0 ? "sm:col-span-2 sm:p-7" : ""}`}>
      <p className="text-xs font-bold uppercase text-primary">{story.member_name}</p>
      <Quote className="mt-4 h-6 w-6 text-primary" aria-hidden="true" />
      <h4 className="mt-2 font-[Outfit] text-xl font-semibold sm:text-2xl">{story.title}</h4>
      <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{story.body}</p>
    </article>)}</div> : <div className="mt-5 flex gap-4 border-l-4 border-primary bg-card px-5 py-6">
      <Sprout className="mt-1 h-7 w-7 shrink-0 text-primary" />
      <div><p className="font-[Outfit] text-xl font-semibold">Este espaço também está começando.</p><p className="mt-2 text-sm leading-relaxed text-muted-foreground">As primeiras histórias ainda estão sendo construídas. Quando forem autorizadas, terão lugar aqui.</p></div>
    </div>}
    <p className="mt-3 text-xs text-muted-foreground">No Mural, só histórias autorizadas por quem foi reconhecido.</p>
  </section>;
}

const achievementIcons = { member: Leaf, cause: Heart, connected: Users, first: MessageCircle, circle: HeartHandshake, growing: Sprout, continues: Leaf, multiplies: Users, voice: Star };
const achievementTones = ["bg-[hsl(var(--portal-journey))] text-[hsl(var(--portal-journey-foreground))]", "bg-[hsl(var(--portal-today))] text-[hsl(var(--portal-today-foreground))]", "bg-[hsl(var(--portal-sessions))] text-[hsl(var(--portal-sessions-foreground))]"];

export function MovementAchievementSymbol({ id, index }: { id: string; index: number }) {
  const Icon = achievementIcons[id as keyof typeof achievementIcons] || Star;
  return <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${achievementTones[index % achievementTones.length]}`}><Icon className="h-6 w-6" aria-hidden="true" /></span>;
}