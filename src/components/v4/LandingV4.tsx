import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, Bell, BookOpen, CalendarDays, Check, CheckCircle2, ChevronDown,
  ChevronUp, LockKeyhole, Menu, MessageCircle, Mic, NotebookPen,
  ShieldCheck, Sparkles, UserRound, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { checkoutHref, trackLandingCta } from "@/lib/landing-analytics";
import { PLAN_MONTHLY_EQUIVALENT, fmtBRL, type PlanId } from "@/lib/plan-pricing";
import logoOlaAura from "@/assets/logo-ola-aura.png";
import avatarAura from "@/assets/avatar-aura.jpg";

const V = "v4" as const;

function Cta({ source, label, children, className = "" }: { source: "hero" | "pricing" | "sticky" | "header" | "final" | "demo"; label: string; children: ReactNode; className?: string }) {
  return (
    <Button asChild variant="sage" size="lg" className={className}>
      <Link to={checkoutHref(source, V)} onClick={() => trackLandingCta(source, label, V)}>{children}</Link>
    </Button>
  );
}

export function HeaderV4() {
  const [open, setOpen] = useState(false);
  return (
    <header className="absolute inset-x-0 top-0 z-40 border-b border-primary-foreground/10">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
        <Link to="/v4" aria-label="Olá AURA"><img src={logoOlaAura} alt="Olá AURA" className="h-14 w-auto brightness-0 invert" /></Link>
        <nav className="hidden items-center gap-7 md:flex">
          <a href="#experiencia" className="text-sm font-semibold text-primary-foreground/70 transition-colors hover:text-primary-foreground">A experiência</a>
          <a href="#como-funciona" className="text-sm font-semibold text-primary-foreground/70 transition-colors hover:text-primary-foreground">Como funciona</a>
          <a href="#precos" className="text-sm font-semibold text-primary-foreground/70 transition-colors hover:text-primary-foreground">Planos</a>
          <Cta source="header" label="Experimentar a AURA (v4 header)" className="rounded-full px-6">Experimentar a AURA</Cta>
        </nav>
        <Button type="button" variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground md:hidden" aria-label={open ? "Fechar menu" : "Abrir menu"} onClick={() => setOpen((value) => !value)}>
          {open ? <X /> : <Menu />}
        </Button>
      </div>
      {open && (
        <nav className="border-t border-primary-foreground/10 bg-[hsl(var(--v4-ink))] px-5 py-5 md:hidden">
          <div className="mx-auto flex max-w-7xl flex-col gap-4">
            <a href="#experiencia" onClick={() => setOpen(false)} className="text-sm font-semibold text-primary-foreground/80">A experiência</a>
            <a href="#como-funciona" onClick={() => setOpen(false)} className="text-sm font-semibold text-primary-foreground/80">Como funciona</a>
            <a href="#precos" onClick={() => setOpen(false)} className="text-sm font-semibold text-primary-foreground/80">Planos</a>
            <Cta source="header" label="Experimentar a AURA (v4 menu)" className="w-full">Experimentar a AURA</Cta>
          </div>
        </nav>
      )}
    </header>
  );
}

function TodayScreen({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`overflow-hidden rounded-[1.75rem] border border-primary-foreground/15 bg-background text-foreground v4-screen-shadow ${compact ? "p-3" : "p-4 sm:p-5"}`}>
      <div className="mb-5 flex items-center justify-between">
        <div><p className="text-[10px] font-bold uppercase text-primary">Seu momento</p><p className="font-display text-xl font-semibold">Boa tarde, Marina</p></div>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary"><Bell className="h-4 w-4 text-primary" /></span>
      </div>
      <div className="rounded-xl bg-primary p-5 text-primary-foreground">
        <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-foreground/10"><BookOpen className="h-5 w-5" /></span><div><p className="text-[10px] font-bold uppercase text-primary-foreground/65">Continue de onde parou</p><h3 className="mt-1 font-display text-xl font-semibold leading-tight">O limite que você quase colocou</h3><p className="mt-2 text-xs leading-relaxed text-primary-foreground/75">Seu próximo episódio continua a reflexão sobre escolhas que protegem você.</p></div></div>
        <div className="mt-4 flex items-center justify-between rounded-lg bg-primary-foreground px-4 py-2.5 text-sm font-bold text-primary"><span>Continuar episódio</span><ArrowRight className="h-4 w-4" /></div>
      </div>
      {!compact && <div className="mt-4 flex items-center gap-3 border-t border-border pt-4"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary"><MessageCircle className="h-4 w-4 text-primary" /></span><div><p className="text-xs font-bold">Também pode esperar</p><p className="text-[11px] text-muted-foreground">A AURA continua disponível para conversar.</p></div></div>}
      <div className="mt-5 flex justify-around border-t border-border pt-3 text-[10px] font-semibold text-muted-foreground"><span className="text-primary">Hoje</span><span>Conversar</span><span>Sessões</span><span>Mais</span></div>
    </div>
  );
}

export function HeroV4() {
  return (
    <section id="hero-section" className="v4-ink-section relative min-h-[94svh] overflow-hidden pt-24 lg:pt-28">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 pb-14 sm:px-8 lg:min-h-[calc(94svh-9rem)] lg:grid-cols-[1.08fr_.92fr] lg:gap-16 lg:pb-14">
        <div className="v4-rise relative z-10 max-w-3xl">
          <p className="mb-5 inline-flex items-center gap-2 border-l-2 border-primary px-3 text-xs font-bold uppercase text-primary-foreground/65">Uma inteligência que acompanha o que muda em você</p>
          <h1 className="v4-balance font-display text-[2.75rem] font-semibold leading-[1.02] text-primary-foreground sm:text-6xl lg:text-7xl">
            Enxergue o que está te prendendo. <span className="text-[hsl(var(--v4-sun))]">Mude o que você não quer mais repetir.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-primary-foreground/70 sm:text-lg">
            A AURA acompanha sua história, conecta o que você vive e ajuda a transformar confusão em decisões, padrões em consciência e consciência em movimento.
          </p>
          <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <Cta source="hero" label="Experimentar por 7 dias (v4 hero)" className="w-full rounded-xl px-8 sm:w-auto">Experimentar por 7 dias <ArrowRight /></Cta>
            <p className="text-xs leading-relaxed text-primary-foreground/55">A partir de R$ 6,90<br className="hidden sm:block" /> · cancelamento simples</p>
          </div>
          <div className="mt-9 grid max-w-xl grid-cols-3 divide-x divide-primary-foreground/15 border-y border-primary-foreground/15 py-4 text-center sm:text-left">
            <div className="pr-3"><p className="font-display text-lg text-primary-foreground">Texto e áudio</p><p className="mt-1 text-[11px] text-primary-foreground/50">do jeito que sair</p></div>
            <div className="px-3"><p className="font-display text-lg text-primary-foreground">24 horas</p><p className="mt-1 text-[11px] text-primary-foreground/50">quando precisar</p></div>
            <div className="pl-3"><p className="font-display text-lg text-primary-foreground">Com memória</p><p className="mt-1 text-[11px] text-primary-foreground/50">sem começar do zero</p></div>
          </div>
        </div>
        <div className="v4-rise-late relative mx-auto w-full max-w-[430px] pb-5">
          <div className="absolute -left-8 top-20 hidden w-56 rounded-xl border border-primary-foreground/15 bg-[hsl(var(--v4-ink-soft))] p-4 text-primary-foreground shadow-card lg:block">
            <p className="text-[10px] font-bold uppercase text-primary-foreground/50">AURA percebeu</p><p className="mt-2 font-display text-lg leading-snug">Talvez o medo não seja de escolher errado — mas de se responsabilizar pela escolha.</p><p className="mt-2 text-xs text-primary-foreground/55">Isso combina com você?</p>
          </div>
          <div className="relative ml-auto w-[88%]"><TodayScreen /></div>
          <div className="absolute -bottom-2 left-0 w-52 rounded-xl bg-[hsl(var(--v4-lilac))] p-4 text-accent-foreground shadow-card">
            <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4" /><p className="text-[10px] font-bold uppercase">Próximo encontro</p></div><p className="mt-2 text-sm font-bold">Você não precisa chegar sem saber por onde começar.</p>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-7xl border-t border-primary-foreground/10 px-5 py-4 text-center text-xs text-primary-foreground/50 sm:px-8">Não faz diagnóstico e não substitui atendimento profissional. É acompanhamento para o dia a dia.</div>
    </section>
  );
}

const transformations = [
  ["Uma decisão que não sai do lugar", "se torna uma escolha que você consegue sustentar."],
  ["Um padrão que sempre se repete", "ganha nome, contexto e uma possibilidade diferente."],
  ["Uma conversa que termina em desabafo", "continua como direção, encontro ou reflexão."],
];

export function TransformationV4() {
  return (
    <section className="bg-background py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[.8fr_1.2fr]">
          <div><p className="text-xs font-bold uppercase text-primary">O valor não está só em ser ouvida</p><h2 className="v4-balance mt-4 font-display text-4xl font-semibold leading-tight sm:text-5xl">É perceber o que você não conseguia ver sozinha.</h2><p className="mt-5 max-w-md leading-relaxed text-muted-foreground">A AURA não promete respostas prontas. Ela acompanha o contexto, faz perguntas melhores e devolve possibilidades que você pode confirmar, corrigir e aprofundar.</p></div>
          <div className="divide-y divide-border border-y border-border">
            {transformations.map(([before, after]) => <div key={before} className="grid gap-2 py-6 sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-5"><p className="text-sm text-muted-foreground">{before}</p><ArrowRight className="hidden h-4 w-4 text-primary sm:block" /><p className="font-display text-xl font-semibold">{after}</p></div>)}
          </div>
        </div>
      </div>
    </section>
  );
}

const experienceTabs = [
  { id: "hoje", label: "Hoje", icon: Sparkles },
  { id: "conversa", label: "Conversa", icon: MessageCircle },
  { id: "sessao", label: "Sessão", icon: CalendarDays },
  { id: "jornada", label: "Jornada", icon: BookOpen },
] as const;
type Experience = typeof experienceTabs[number]["id"];

function ExperienceScreen({ active }: { active: Experience }) {
  if (active === "hoje") return <TodayScreen compact />;
  if (active === "conversa") return <div className="rounded-[1.75rem] bg-background p-4 text-foreground v4-screen-shadow"><div className="flex items-center gap-3 border-b border-border pb-3"><img src={avatarAura} alt="AURA" className="h-10 w-10 rounded-full object-cover" /><div><p className="text-sm font-bold">AURA</p><p className="text-[11px] text-primary">disponível</p></div></div><div className="space-y-3 py-5 text-sm"><p className="ml-auto max-w-[82%] rounded-xl rounded-br-sm bg-secondary p-3">Eu sei que preciso dizer não, mas fico me sentindo culpada.</p><p className="max-w-[88%] rounded-xl rounded-bl-sm border border-border bg-card p-3">Posso testar uma leitura com você?</p><p className="max-w-[88%] rounded-xl rounded-bl-sm border border-border bg-card p-3">Talvez a culpa não esteja dizendo que o limite é errado. Talvez ela só mostre que você ainda não está acostumada a se escolher. Isso faz sentido ou não é bem assim?</p></div><div className="flex items-center gap-2 rounded-full bg-muted px-4 py-2 text-xs text-muted-foreground"><Mic className="h-4 w-4" /> Escreva ou envie um áudio</div></div>;
  if (active === "sessao") return <div className="rounded-[1.75rem] bg-background p-5 text-foreground v4-screen-shadow"><p className="text-[10px] font-bold uppercase text-primary">Seu encontro</p><h3 className="mt-1 font-display text-2xl font-semibold">Chegue com o que importa vivo</h3><div className="mt-5 rounded-xl border-2 border-primary bg-card p-4"><div className="flex items-center gap-3"><NotebookPen className="text-primary" /><div><p className="text-sm font-bold">Preparar encontro</p><p className="text-xs text-muted-foreground">O que você não quer deixar de conversar?</p></div></div><p className="mt-4 rounded-lg bg-muted p-3 text-sm">“Quero entender por que adio uma decisão que já parece clara.”</p><div className="mt-3 rounded-lg bg-primary px-4 py-2 text-center text-sm font-bold text-primary-foreground">Salvar preparação</div></div><p className="mt-4 text-xs leading-relaxed text-muted-foreground">Na hora marcada, a AURA começa por aqui — sem te prender ao tema se seu momento tiver mudado.</p></div>;
  return <div className="rounded-[1.75rem] bg-background p-5 text-foreground v4-screen-shadow"><p className="text-[10px] font-bold uppercase text-primary">Sua jornada</p><h3 className="mt-1 font-display text-2xl font-semibold">Limites sem culpa</h3><div className="mt-5 overflow-hidden rounded-xl bg-[hsl(var(--v4-lilac))] p-5"><p className="text-xs font-bold text-accent-foreground/65">EPISÓDIO 03</p><p className="mt-2 font-display text-2xl font-semibold text-accent-foreground">O desconforto de se escolher</p><p className="mt-3 text-sm leading-relaxed text-accent-foreground/75">Uma reflexão para diferenciar culpa de responsabilidade quando você começa a colocar limites.</p><div className="mt-5 h-1.5 overflow-hidden rounded-full bg-accent-foreground/10"><div className="h-full w-2/3 rounded-full bg-[hsl(var(--v4-plum))]" /></div></div><p className="mt-4 flex items-center gap-2 text-xs font-bold text-primary"><CheckCircle2 className="h-4 w-4" /> Seu ritmo é preservado. Sem acúmulo.</p></div>;
}

export function ProductExperienceV4() {
  const [active, setActive] = useState<Experience>("hoje");
  const copy: Record<Experience, [string, string]> = {
    hoje: ["Uma direção por vez.", "O App considera o que está acontecendo e mostra o que merece atenção agora — sem virar uma lista de obrigações."],
    conversa: ["Uma conversa que pensa com você.", "A AURA escuta, pergunta e apresenta leituras como hipóteses que você pode confirmar ou corrigir."],
    sessao: ["Profundidade quando o tema pede.", "Você agenda e prepara um encontro de 45 minutos diretamente no App. O fechamento permanece com você."],
    jornada: ["Um tema continua entre conversas.", "Episódios ligados ao seu momento ajudam uma descoberta a não desaparecer quando a conversa termina."],
  };
  return (
    <section id="experiencia" className="v4-ink-soft py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="max-w-3xl"><p className="text-xs font-bold uppercase text-primary">Não é uma coleção de recursos</p><h2 className="v4-balance mt-4 font-display text-4xl font-semibold leading-tight text-primary-foreground sm:text-5xl">É uma experiência que continua trabalhando com você depois da conversa.</h2></div>
        <div className="mt-12 grid items-center gap-10 lg:grid-cols-[.75fr_1.25fr] lg:gap-16">
          <div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">{experienceTabs.map(({ id, label, icon: Icon }) => <Button key={id} type="button" variant={active === id ? "default" : "ghost"} className={active === id ? "justify-start" : "justify-start text-primary-foreground/60 hover:bg-primary-foreground/10 hover:text-primary-foreground"} onClick={() => setActive(id)}><Icon />{label}</Button>)}</div>
            <h3 className="mt-8 font-display text-3xl font-semibold text-primary-foreground">{copy[active][0]}</h3><p className="mt-4 max-w-md leading-relaxed text-primary-foreground/65">{copy[active][1]}</p>
            <div className="mt-7 flex items-center gap-3 border-l-2 border-primary pl-4 text-sm text-primary-foreground/70"><Sparkles className="h-5 w-5 shrink-0 text-primary" /><span>O valor de cada área aparece no momento em que ela pode ajudar.</span></div>
          </div>
          <div className="mx-auto w-full max-w-md"><ExperienceScreen active={active} /></div>
        </div>
      </div>
    </section>
  );
}

export function HowItWorksV4() {
  const steps = [
    { n: "01", title: "Você traz a vida como ela está", text: "Uma dúvida, uma relação, uma decisão ou aquilo que você ainda nem sabe explicar. Por texto ou áudio." },
    { n: "02", title: "A AURA ajuda você a enxergar", text: "Ela conecta contexto, faz perguntas e testa hipóteses — sem te reduzir a um rótulo ou dizer quem você é." },
    { n: "03", title: "A percepção ganha continuidade", text: "O que importa pode virar direção no Hoje, preparação de sessão, Jornada ou parte do retrato construído com você." },
  ];
  return <section id="como-funciona" className="v4-fine-grid bg-background py-20 sm:py-28"><div className="mx-auto max-w-6xl px-5 sm:px-8"><div className="grid gap-12 lg:grid-cols-[.7fr_1.3fr]"><div><p className="text-xs font-bold uppercase text-primary">Como a mudança começa</p><h2 className="mt-4 font-display text-4xl font-semibold leading-tight sm:text-5xl">Não é uma resposta perfeita. É uma nova forma de olhar e agir.</h2></div><ol className="border-t border-border">{steps.map((step) => <li key={step.n} className="grid gap-3 border-b border-border py-7 sm:grid-cols-[3rem_1fr_1.2fr] sm:items-start"><span className="font-display text-2xl text-primary">{step.n}</span><h3 className="font-display text-xl font-semibold">{step.title}</h3><p className="text-sm leading-relaxed text-muted-foreground">{step.text}</p></li>)}</ol></div></div></section>;
}

export function PortraitV4() {
  return <section className="bg-[hsl(var(--v4-lilac))] py-20 sm:py-28"><div className="mx-auto grid max-w-6xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-2"><div><p className="text-xs font-bold uppercase text-[hsl(var(--v4-plum))]">Sobre você</p><h2 className="v4-balance mt-4 font-display text-4xl font-semibold leading-tight text-accent-foreground sm:text-5xl">A AURA não define quem você é. Ela constrói esse entendimento com você.</h2><p className="mt-5 max-w-xl leading-relaxed text-accent-foreground/70">Você vê de onde veio cada informação, confirma o que faz sentido, corrige o que não representa você e exclui o que não quer manter.</p></div><div className="rounded-2xl border border-accent-foreground/15 bg-card p-6 shadow-card"><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent"><UserRound className="text-accent-foreground" /></span><div><p className="text-xs font-bold uppercase text-muted-foreground">Leitura em construção</p><h3 className="font-display text-xl font-semibold">Como você tem lidado com escolhas</h3></div></div><p className="mt-5 text-sm leading-relaxed">Uma possibilidade é que você adie certas decisões não por falta de clareza, mas porque escolher também significa abrir mão. Isso combina com sua experiência?</p><div className="mt-5 grid grid-cols-3 gap-2"><Button type="button" variant="default" size="sm">Confirmar</Button><Button type="button" variant="outline" size="sm">Corrigir</Button><Button type="button" variant="ghost" size="sm">Excluir</Button></div></div></div></section>;
}

const plans: { id: PlanId; name: string; sessions: string; description: string; featured?: boolean }[] = [
  { id: "essencial", name: "Essencial", sessions: "1 encontro por mês", description: "Para ter a AURA por perto e aprofundar quando precisar." },
  { id: "direcao", name: "Direção", sessions: "4 encontros por mês", description: "Para quem quer continuidade e um espaço semanal de profundidade.", featured: true },
  { id: "transformacao", name: "Transformação", sessions: "8 encontros por mês", description: "Para fases que pedem presença e acompanhamento mais frequentes." },
];

export function PricingV4() {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? plans : plans.filter((plan) => plan.featured);
  return <section id="precos" className="bg-background py-20 sm:py-28"><div className="mx-auto max-w-6xl px-5 sm:px-8"><div className="mx-auto max-w-3xl text-center"><p className="text-xs font-bold uppercase text-primary">Comece sentindo a experiência</p><h2 className="v4-balance mt-4 font-display text-4xl font-semibold leading-tight sm:text-5xl">Sete dias para descobrir o que muda quando você não precisa elaborar tudo sozinha.</h2><p className="mt-5 text-muted-foreground">Acesso completo ao plano escolhido por R$ 6,90. Antes de pagar, você vê com clareza o valor e a próxima cobrança.</p></div><div className={`mx-auto mt-12 grid max-w-5xl gap-5 ${showAll ? "md:grid-cols-3" : "max-w-md"}`}>{visible.map((plan) => <article key={plan.id} className={`flex flex-col rounded-2xl border bg-card p-6 ${plan.featured ? "border-primary shadow-card" : "border-border"}`}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase text-primary">{plan.featured ? "Recomendado" : "Outra intensidade"}</p><h3 className="mt-2 font-display text-3xl font-semibold">{plan.name}</h3></div>{plan.featured && <Sparkles className="text-primary" />}</div><p className="mt-4 text-sm leading-relaxed text-muted-foreground">{plan.description}</p><div className="mt-6 border-y border-border py-5"><p className="font-display text-3xl font-semibold">{fmtBRL(PLAN_MONTHLY_EQUIVALENT[plan.id].monthly)}<span className="font-body text-sm font-normal text-muted-foreground">/mês</span></p><p className="mt-1 text-xs text-muted-foreground">após os 7 dias iniciais</p></div><ul className="my-6 flex-1 space-y-3 text-sm"><li className="flex gap-2"><Check className="text-primary" /> Conversas por texto e áudio 24/7</li><li className="flex gap-2"><Check className="text-primary" /> {plan.sessions}</li><li className="flex gap-2"><Check className="text-primary" /> Hoje, Jornadas e seu percurso</li></ul><Button asChild variant={plan.featured ? "sage" : "outline"} size="lg" className="w-full"><Link to={`${checkoutHref("pricing", V)}&plan=${plan.id}&billing=monthly`} onClick={() => trackLandingCta("pricing", `${plan.name} mensal (v4)`, V)}>Experimentar por R$ 6,90</Link></Button></article>)}</div><div className="mt-6 text-center"><Button type="button" variant="ghost" onClick={() => setShowAll((value) => !value)}>{showAll ? <><ChevronUp /> Ver somente o recomendado</> : <><ChevronDown /> Comparar outros planos</>}</Button><p className="mt-4 text-xs text-muted-foreground">Também há opções trimestral, semestral e anual no checkout · cartão ou PIX · cancelamento simples</p></div></div></section>;
}

const faqs = [
  ["O que é a AURA?", "A AURA é uma inteligência de acompanhamento dentro do app Olá Aura. Você conversa por texto ou áudio, aprofunda temas em encontros de 45 minutos e encontra direções, Jornadas e registros ligados ao que está vivendo."],
  ["Ela vai dizer o que eu tenho ou quem eu sou?", "Não. A AURA não faz diagnóstico. Leituras sobre padrões ou situações são apresentadas como possibilidades para você confirmar, corrigir ou rejeitar."],
  ["Como funcionam os 7 dias iniciais?", "Você escolhe um plano e paga R$ 6,90 para experimentar por sete dias. Antes do pagamento, o checkout informa o valor e a periodicidade da cobrança seguinte. Você pode cancelar."],
  ["Posso conversar por áudio?", "Sim. Você pode enviar e receber áudio dentro do App, além de usar texto quando preferir."],
  ["A AURA substitui atendimento psicológico?", "Não. A AURA oferece acompanhamento no dia a dia, mas não substitui atendimento profissional e não é um serviço de emergência."],
  ["Tenho controle sobre o que fica salvo?", "Sim. Na área Sobre você, informações e leituras podem ser confirmadas, corrigidas ou excluídas por você."],
];

export function FaqV4() {
  const [open, setOpen] = useState(0);
  return <section id="faq" className="bg-muted/40 py-20 sm:py-28"><div className="mx-auto grid max-w-6xl gap-12 px-5 sm:px-8 lg:grid-cols-[.65fr_1.35fr]"><div><p className="text-xs font-bold uppercase text-primary">Antes de começar</p><h2 className="mt-4 font-display text-4xl font-semibold">Perguntas importantes, respostas diretas.</h2><div className="mt-7 flex items-center gap-3 text-sm text-muted-foreground"><ShieldCheck className="text-primary" /> Privacidade e controle desde o início.</div></div><div className="border-t border-border">{faqs.map(([q, a], index) => <div key={q} className="border-b border-border"><Button type="button" variant="ghost" className="h-auto w-full justify-between rounded-none px-0 py-5 text-left font-display text-lg whitespace-normal hover:bg-transparent" onClick={() => setOpen(open === index ? -1 : index)} aria-expanded={open === index}><span>{q}</span>{open === index ? <ChevronUp /> : <ChevronDown />}</Button>{open === index && <p className="max-w-2xl pb-6 text-sm leading-relaxed text-muted-foreground">{a}</p>}</div>)}</div></div></section>;
}

export function ClosingV4() {
  return <section className="v4-ink-section py-20 sm:py-28"><div className="mx-auto max-w-5xl px-5 text-center sm:px-8"><p className="text-xs font-bold uppercase text-primary">Talvez você já saiba mais do que consegue sustentar sozinha</p><h2 className="v4-balance mx-auto mt-5 max-w-4xl font-display text-4xl font-semibold leading-tight text-primary-foreground sm:text-6xl">O próximo passo não precisa ser descobrir tudo. Pode ser começar a olhar de outro jeito.</h2><p className="mx-auto mt-6 max-w-2xl leading-relaxed text-primary-foreground/65">Experimente a AURA por sete dias e veja como é ter uma inteligência que acompanha sua história sem tomar o lugar das suas escolhas.</p><div className="mt-9"><Cta source="final" label="Quero experimentar a AURA (v4 final)" className="rounded-xl px-8">Quero experimentar a AURA <ArrowRight /></Cta></div></div></section>;
}

export function FooterV4() {
  return <footer className="v4-ink-soft border-t border-primary-foreground/10 py-12 text-primary-foreground"><div className="mx-auto max-w-6xl px-5 sm:px-8"><div className="grid gap-8 sm:grid-cols-3"><div><img src={logoOlaAura} alt="Olá AURA" className="h-14 w-auto brightness-0 invert" /><p className="mt-3 max-w-xs text-xs leading-relaxed text-primary-foreground/55">Uma inteligência que acompanha sua história e ajuda você a transformar percepção em movimento.</p></div><div><p className="text-xs font-bold uppercase text-primary-foreground/50">Acesso</p><div className="mt-4 flex flex-col gap-2 text-sm text-primary-foreground/70"><Link to="/meu-espaco">Entrar no App</Link><Link to="/blog">Blog</Link><a href="mailto:suporte@olaaura.com.br">Suporte</a></div></div><div><p className="text-xs font-bold uppercase text-primary-foreground/50">Confiança</p><div className="mt-4 flex flex-col gap-2 text-sm text-primary-foreground/70"><Link to="/privacidade">Privacidade</Link><Link to="/termos">Termos de uso</Link><Link to="/cancelar">Cancelar assinatura</Link></div></div></div><div className="mt-10 flex flex-col gap-3 border-t border-primary-foreground/10 pt-6 text-xs text-primary-foreground/45 sm:flex-row sm:items-center sm:justify-between"><p>© {new Date().getFullYear()} Olá AURA.</p><p className="flex items-center gap-2"><LockKeyhole className="h-3.5 w-3.5" /> AURA não substitui atendimento profissional.</p></div></div></footer>;
}

export function StickyCtaV4() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onScroll = () => setShow(window.scrollY > Math.max(480, window.innerHeight * 0.72));
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (!show) return null;
  return <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 p-3 backdrop-blur md:hidden"><Cta source="sticky" label="Experimentar por R$ 6,90 (v4 sticky)" className="w-full rounded-xl">Experimentar por R$ 6,90 <ArrowRight /></Cta></div>;
}