import { Helmet } from "react-helmet-async";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "@/styles/v2-theme.css";
import { Button } from "@/components/ui/button";
import {
  Star, ShieldCheck, Lock, MessageCircle, CalendarHeart, Sparkles, Check, X, Mic, Moon,
  Waypoints, Compass, BookMarked, Route, Cloud, Play, HeartHandshake, MoreVertical,
  Feather, Zap, RefreshCcw, Sunrise,
} from "lucide-react";
import logoHorizontal from "@/assets/logo-ola-aura-horizontal.png";
import avatarAura from "@/assets/avatar-aura.jpg";
import movementImage from "@/assets/movimento-ola-aura.jpg";
import AppTourV2 from "@/components/v2/AppTourV2";
import PrayerSlides from "@/components/v5/PrayerSlides";
import SessionSummarySlides from "@/components/v5/SessionSummarySlides";
import PricingV2 from "@/components/v2/PricingV2";
import FAQV2 from "@/components/v2/FAQV2";
import FooterV2 from "@/components/v2/FooterV2";
import { trackLandingCta, checkoutHref, useLandingEngagement, type CtaSource } from "@/lib/landing-analytics";
import { trackViewItem } from "@/lib/ga4";
import { trackMetaViewContent } from "@/lib/meta-pixel";
import "@/styles/v5-hero.css";
import heroRefugio from "@/assets/v5-hero-refugio.jpg";

// Números reais (session_ratings e conclusão de orações), atualizar manualmente.
const METRICS = [
  { value: "4,6★", label: "nota média dada aos encontros guiados" },
  { value: "91%", label: "avaliam o encontro com 4 ou 5 estrelas" },
  { value: "91%", label: "ouvem as orações até a última palavra" },
  { value: "24h", label: "seu porto seguro, sempre que precisar" },
];

function Metrics() {
  return (
    <section aria-label="Resultados" className="bg-[hsl(var(--v2-navy))] pb-12 md:pb-16">
      <div className="container mx-auto px-5 grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5">
        {METRICS.map((m) => (
          <div key={m.label} className="rounded-2xl border border-[hsl(var(--v2-navy-foreground)/0.12)] bg-[hsl(var(--v2-navy-foreground)/0.05)] p-4 md:p-6 text-center backdrop-blur">
            <div className="v5-gradient-text font-semibold text-3xl md:text-4xl">{m.value}</div>
            <p className="mt-1 text-xs md:text-sm text-[hsl(var(--v2-navy-muted))]">{m.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// Página V5: versão de alta conversão, independente da /v2.
const V = "v5" as const;

const Cta = ({ source, label = "Começar por R$ 6,90", className = "" }: { source: CtaSource; label?: string; className?: string }) => (
  <Link to={checkoutHref(source, V)} onClick={() => trackLandingCta(source, `${label} (v5)`, V)} className="block w-full sm:w-auto">
    <Button variant="sage" size="xl" className={`w-full sm:w-auto rounded-2xl px-10 shadow-lg ${className}`}>
      {label}
    </Button>
  </Link>
);

const Reassure = ({ dark = false }: { dark?: boolean }) => (
  <p className={`text-xs ${dark ? "text-[hsl(var(--v2-navy-muted))]" : "text-muted-foreground"}`}>
    7 dias por R$ 6,90 · cancele em 1 clique · reembolso em 7 dias
  </p>
);

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{children}</p>
);

const NAV = [
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#app", label: "O App" },
  { href: "#encontros", label: "Encontros" },
  { href: "#oracoes", label: "Orações" },
  { href: "#depoimentos", label: "Depoimentos" },
  { href: "#planos", label: "Planos" },
  { href: "#duvidas", label: "Dúvidas" },
];

const goTo = (href: string) => {
  const el = document.querySelector(href);
  if (!el) return;
  const y = el.getBoundingClientRect().top + window.scrollY - 64;
  window.scrollTo({ top: y, behavior: "smooth" });
};

const Header = () => {
  const [open, setOpen] = useState(false);
  const linkCls = "text-sm text-[hsl(var(--v2-navy-foreground)/0.75)] hover:text-[hsl(var(--v2-navy-foreground))] transition-colors";
  return (
  <header className="fixed inset-x-0 top-0 z-40 bg-[hsl(var(--v2-navy)/0.85)] backdrop-blur-md border-b border-[hsl(var(--v2-navy-foreground)/0.08)] text-[hsl(var(--v2-navy-foreground))]">
    <div className="container mx-auto px-5 h-14 flex items-center justify-between">
      <a href="#hero-section" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }} aria-label="Olá AURA — início">
        <img src={logoHorizontal} alt="Olá AURA" className="h-6 sm:h-7 w-auto brightness-0 invert" />
      </a>
      <nav className="hidden lg:flex items-center gap-5">
        {NAV.map((n) => (
          <a key={n.href} href={n.href} onClick={(e) => { e.preventDefault(); goTo(n.href); }} className={linkCls}>{n.label}</a>
        ))}
      </nav>
      <div className="flex items-center gap-2 sm:gap-4">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          aria-expanded={open}
          className="lg:hidden order-last p-2 -mr-2 rounded-full hover:bg-[hsl(var(--v2-navy-foreground)/0.08)]"
        >
          {open ? <X className="w-5 h-5" /> : <MoreVertical className="w-5 h-5" />}
        </button>
        <Link to="/meu-espaco" className="text-xs sm:text-sm text-[hsl(var(--v2-navy-foreground)/0.75)] hover:text-[hsl(var(--v2-navy-foreground))] transition-colors">
          <span className="hidden sm:inline">Já sou assinante · </span>Entrar
        </Link>
        <Link to={checkoutHref("header", V)} onClick={() => trackLandingCta("header", "Começar (v5)", V)}>
          <Button variant="sage" size="sm" className="rounded-full px-5">Começar</Button>
        </Link>
      </div>
    </div>
    {open && (
      <nav className="lg:hidden border-t border-[hsl(var(--v2-navy-foreground)/0.08)] bg-[hsl(var(--v2-navy)/0.97)] max-h-[calc(100dvh-3.5rem)] overflow-y-auto">
        <div className="container mx-auto px-5 py-4 flex flex-col">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} onClick={(e) => { e.preventDefault(); setOpen(false); setTimeout(() => goTo(n.href), 10); }} className="py-3 text-base border-b border-[hsl(var(--v2-navy-foreground)/0.06)] text-[hsl(var(--v2-navy-foreground)/0.85)]">{n.label}</a>
          ))}
          <Link to="/meu-espaco" className="py-3 text-base text-[hsl(var(--v2-navy-foreground)/0.85)]">Já sou assinante · Entrar</Link>
          <Link to={checkoutHref("header", V)} onClick={() => trackLandingCta("header", "Menu: Começar (v5)", V)} className="mt-2">
            <Button variant="sage" className="w-full rounded-full">Começar por R$ 6,90</Button>
          </Link>
        </div>
      </nav>
    )}
  </header>
  );
};

// Cenários do "Efeito Espelho": dores e reframes reais mais frequentes nas sessões (temas e reframes 5★).
const MIRROR = [
  {
    id: "mente",
    icon: Moon,
    label: "Minha cabeça não desliga",
    user: "Fico com o coração disparado prevendo o pior. Parece que se eu não vigiar tudo, alguma coisa vai desabar.",
    aura: "Prever o pior não te protege contra a dor: só rouba a sua paz do presente. Você pode tirar o uniforme de sentinela e respirar.",
  },
  {
    id: "exaustao",
    icon: Cloud,
    label: "Exaustão e culpa por não dar conta",
    user: "Tudo que começo eu não termino. Parece que tô estagnada e falhando com todo mundo.",
    aura: "Você não tá travada por incapacidade. Tá olhando pra tudo de uma vez só e usando o cansaço pra se condenar. Isso é exaustão, não fracasso.",
  },
  {
    id: "relacao",
    icon: HeartHandshake,
    label: "Carregando tudo sozinha na relação",
    user: "Faço de tudo pra ver a pessoa bem e recebo cobrança. Até onde eu devo continuar numa relação assim?",
    aura: "Existe uma diferença brutal entre tolerar manias e tolerar desamparo. O limite é até onde a relação não exige que você se desmonte inteira pra caber nela.",
  },
];

const useTyped = (text: string, speed = 22) => {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setN(text.length); return; }
    let i = 0;
    let t: number;
    const start = window.setTimeout(function tick() {
      i += 1; setN(i);
      if (i < text.length) t = window.setTimeout(tick, speed);
    }, 900);
    return () => { clearTimeout(start); clearTimeout(t); };
  }, [text, speed]);
  return { shown: text.slice(0, n), typing: n === 0, done: n >= text.length };
};

const Hero = () => {
  const [idx, setIdx] = useState(0);
  const [manual, setManual] = useState(false);
  const sc = MIRROR[idx];
  const { shown, typing, done } = useTyped(sc.aura);

  useEffect(() => {
    if (manual || !done) return;
    const t = window.setTimeout(() => setIdx((i) => (i + 1) % MIRROR.length), 4200);
    return () => clearTimeout(t);
  }, [done, manual]);

  return (
  <section id="hero-section" className="v5-hero relative pt-20 md:pt-28 pb-16 md:pb-24 overflow-hidden">
    <img src={heroRefugio} alt="" aria-hidden="true" width={1600} height={1200} fetchPriority="high" className="absolute inset-0 w-full h-full object-cover opacity-60" />
    <div className="absolute inset-0 bg-gradient-to-b from-[hsl(var(--v2-navy)/0.55)] via-[hsl(var(--v2-navy)/0.35)] to-[hsl(var(--v2-navy))]" />
    <div className="v5-orb v5-orb-a" />
    <div className="v5-orb v5-orb-b" />
    <div className="v5-orb v5-orb-c" />
    <div className="v5-grain" />
    <div className="container relative mx-auto px-5 grid md:grid-cols-2 gap-8 md:gap-12 items-center">
      <div className="text-center md:text-left v2-fade-up">
        <span className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--v2-navy-foreground)/0.15)] bg-[hsl(var(--v2-navy-foreground)/0.06)] px-3 py-1 text-xs text-[hsl(var(--v2-navy-foreground)/0.85)] backdrop-blur">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" /> ★ 4,6 de média nos encontros guiados
        </span>
        <h1 className="mt-4 font-sans font-semibold tracking-tight text-[2.6rem] leading-[1.02] md:text-7xl text-[hsl(var(--v2-navy-foreground))]">
          Entenda o que sente.<br /><span className="v5-gradient-text">Mude sua vida.</span>
        </h1>
        <p className="mt-3 text-sm md:text-lg text-[hsl(var(--v2-navy-muted))] max-w-md mx-auto md:mx-0">
          Conversas que escutam de verdade, encontros guiados para organizar a mente e orações para os dias difíceis — 24 horas por dia.
        </p>

        <div className="mt-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[hsl(var(--v2-navy-muted))]">Como você está se sentindo hoje?</p>
          <div className="mt-2 flex flex-wrap justify-center md:justify-start gap-2" role="tablist" aria-label="Escolha o que você sente">
            {MIRROR.map((m, i) => {
              const Icon = m.icon;
              const active = i === idx;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => { setManual(true); setIdx(i); }}
                  className={`v5-chip ${active ? "v5-chip-active" : ""}`}
                >
                  <Icon className="w-3.5 h-3.5" /> {m.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2 items-stretch md:items-start">
          <Cta source="hero" className="v5-shimmer" />
          <Reassure dark />
        </div>
      </div>

      <div className="relative mx-auto w-[250px] md:w-[310px]">
        <div className="v5-halo" />
        <div className="v5-phone">
          <div className="v5-notch" />
          <div className="v5-screen">
            <div className="flex items-center gap-2 pb-3 border-b border-[hsl(var(--v2-navy-foreground)/0.08)]">
              <div className="relative shrink-0">
                <img src={avatarAura} alt="AURA" className="w-9 h-9 rounded-full object-cover ring-2 ring-primary/60 shadow-[0_0_14px_hsl(var(--primary)/0.55)]" />
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-[hsl(var(--v2-navy))]" />
              </div>
              <div className="text-left">
                <p className="text-xs font-semibold text-[hsl(var(--v2-navy-foreground))]">AURA</p>
                <p className="text-[10px] text-primary">{typing ? "lendo você…" : done ? "online" : "digitando…"}</p>
              </div>
            </div>
            <div key={sc.id} className="mt-3 space-y-2 text-[11px] md:text-xs text-left min-h-[230px]">
              <div className="v5-pop ml-auto max-w-[82%] rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-3 py-2">{sc.user}</div>
              {typing ? (
                <div className="v5-pop inline-flex gap-1 rounded-2xl rounded-bl-sm bg-[hsl(var(--v2-navy-foreground)/0.1)] px-3 py-3">
                  <span className="v5-dot" /><span className="v5-dot" style={{ animationDelay: ".15s" }} /><span className="v5-dot" style={{ animationDelay: ".3s" }} />
                </div>
              ) : (
                <div className="max-w-[90%] rounded-2xl rounded-bl-sm bg-[hsl(var(--v2-navy-foreground)/0.1)] text-[hsl(var(--v2-navy-foreground))] px-3 py-2 leading-relaxed">
                  {shown}{!done && <span className="v5-caret" />}
                </div>
              )}
              {done && (
                <div className="v5-pop max-w-[75%] rounded-2xl rounded-bl-sm bg-[hsl(var(--v2-navy-foreground)/0.1)] px-3 py-2 flex items-center gap-2">
                  <Mic className="w-3.5 h-3.5 text-primary shrink-0" />
                  <div className="flex items-end gap-[2px] h-4">
                    {[5,9,14,8,12,16,7,11,15,6,10,13,7].map((h, i) => (
                      <span key={i} className="v5-bar" style={{ height: h, animationDelay: `${i * 0.08}s` }} />
                    ))}
                  </div>
                  <span className="text-[10px] text-[hsl(var(--v2-navy-muted))]">0:24</span>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="v5-float v5-float-l">
          <CalendarHeart className="w-4 h-4 text-primary" />
          <div className="text-left leading-tight"><p className="text-[10px] opacity-70">Encontro guiado</p><p className="text-xs font-semibold">Hoje, 20h</p></div>
        </div>
        <div className="v5-float v5-float-r" style={{ animationDelay: "1.5s" }}>
          <Sparkles className="w-4 h-4 text-primary" />
          <p className="text-xs font-semibold">Oração da noite</p>
        </div>
      </div>
    </div>
    <div className="v5-fade-bottom" />
  </section>
  );
};

// Ícone e matiz de cada transformação (ordem igual aos itens).
const PROBLEM_ICONS = [
  { Icon: Feather, hue: 265 },
  { Icon: Zap, hue: 38 },
  { Icon: ShieldCheck, hue: 140 },
  { Icon: RefreshCcw, hue: 232 },
  { Icon: Compass, hue: 285 },
  { Icon: Sunrise, hue: 22 },
];

const Problem = () => {
  const items = [
    { t: "Pare de sofrer em silêncio.", d: "Quando todo mundo acha que você está bem, mas por dentro você só precisa soltar o peso." },
    { t: "Supere o medo.", d: "A conversa que você evita ou a decisão que adia. Entenda o que trava e dê o primeiro passo." },
    { t: "Diga não sem culpa.", d: "Chega de dizer sim para agradar e pagar com exaustão. Coloque limites sem carregar culpa." },
    { t: "Quebre o ciclo.", d: "A mesma briga, a mesma reação, o mesmo arrependimento. Entenda o padrão e mude sua resposta." },
    { t: "Volte a confiar em você.", d: "Quando você pede opinião para todo mundo e fica mais em dúvida. Resgate a sua própria voz." },
    { t: "Faça as pazes com o passado.", d: "Uma história que acabou ou uma escolha que ainda dói. Encontre paz para seguir em frente." },
  ];
  return (
    <section id="resultados" className="relative py-14 md:py-24 overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[36rem] w-[36rem] rounded-full bg-primary/10 blur-3xl" />
      <div className="relative container mx-auto px-5 max-w-5xl">
        <div className="text-center max-w-2xl mx-auto">
          <Eyebrow>Transformação real</Eyebrow>
          <h2 className="mt-3 font-sans font-semibold tracking-tight text-3xl md:text-5xl leading-tight">O que pode mudar na sua vida</h2>
          <p className="mt-3 text-[15px] md:text-lg text-muted-foreground leading-snug">
            Se você se reconhece em uma dessas situações, a <span className="text-primary font-medium">Aura foi feita para o seu momento.</span>
          </p>
        </div>
        <ul className="mt-6 md:mt-12 grid md:grid-cols-2 gap-2.5 md:gap-4">
          {items.map(({ t, d }, i) => {
            const { Icon } = PROBLEM_ICONS[i];
            return (
            <li
              key={t}
              className="group relative flex items-center gap-3.5 rounded-2xl border border-primary/15 bg-card/70 backdrop-blur-sm py-3 pl-3 pr-3.5 md:p-5 shadow-[0_10px_30px_-18px_hsl(var(--primary)/0.35)] transition-all duration-300 hover:border-primary/30 hover:-translate-y-0.5"
            >
              <span className="shrink-0 flex h-11 w-11 md:h-12 md:w-12 items-center justify-center rounded-xl border border-primary/15 bg-primary/[0.07] text-primary">
                <Icon className="h-5 w-5" strokeWidth={1.5} />
              </span>
              <div className="min-w-0">
                <h3 className="font-sans font-semibold tracking-tight text-[18px] md:text-xl leading-tight text-foreground">{t}</h3>
                <p className="mt-0.5 text-[13.5px] md:text-sm text-muted-foreground leading-snug">{d}</p>
              </div>
            </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
};

const HowItWorks = () => {
  const s = [
    { icon: Mic, t: "Traga a vida como ela está", d: "Conte por texto ou áudio o que aconteceu, o que está pesando ou a decisão que não sai do lugar." },
    { icon: Waypoints, t: "Ela conecta os pontos", d: "A AURA relaciona acontecimentos, percebe padrões e devolve hipóteses para vocês explorarem juntas." },
    { icon: Compass, t: "Você encontra direção", d: "A conversa ganha um fechamento, um próximo passo ou um encontro guiado de 45 minutos para aprofundar." },
  ];
  return (
    <section id="como-funciona" className="relative overflow-hidden py-16 md:py-24">
      {/* Luz ambiente suave, mesma linguagem do topo */}
      <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[38rem] h-[38rem] rounded-full bg-primary/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute bottom-0 -right-24 w-80 h-80 rounded-full bg-accent/20 blur-3xl" />
      <div className="relative container mx-auto px-5 max-w-5xl">
        <div className="text-center max-w-2xl mx-auto">
          <Eyebrow>Como funciona</Eyebrow>
          <h2 className="mt-3 font-sans font-semibold tracking-tight text-3xl md:text-4xl">Simples como mandar uma mensagem. <span className="italic text-gradient-sage">Profundo o bastante para mudar sua perspectiva.</span></h2>
        </div>
        <ol className="relative mt-12 grid md:grid-cols-3 gap-10 md:gap-6">
          {/* Linha fluida que conecta a jornada */}
          <span aria-hidden className="absolute left-[1.6rem] top-8 bottom-8 w-px md:hidden bg-gradient-to-b from-primary/50 via-primary/25 to-transparent" />
          <span aria-hidden className="hidden md:block absolute top-[1.6rem] left-[16%] right-[16%] h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
          {s.map(({ icon: I, t, d }, i) => (
            <li key={t} className="relative flex md:flex-col md:items-center md:text-center gap-5 md:gap-0">
              <div className="relative z-10 shrink-0 w-[3.2rem] h-[3.2rem] rounded-full bg-background/80 backdrop-blur border border-primary/30 shadow-[0_0_30px_-6px_hsl(var(--primary)/0.55)] flex items-center justify-center">
                <I className="w-5 h-5 text-primary" />
              </div>
              <div className="md:mt-6 rounded-3xl bg-card/60 backdrop-blur-md border border-border/40 p-5 md:p-6 shadow-[0_20px_50px_-25px_hsl(var(--primary)/0.35)] flex-1">
                <span className="text-[11px] uppercase tracking-[0.2em] text-primary/70">Passo {i + 1}</span>
                <h3 className="mt-1.5 font-sans font-semibold tracking-tight text-xl">{t}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{d}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
};

const SessionShowcase = () => (
  <section id="encontros" className="py-16 md:py-24 v2-dark-section">
    <div className="container mx-auto px-5 max-w-5xl grid md:grid-cols-2 gap-10 items-center">
      <div>
        <Eyebrow>Encontros guiados</Eyebrow>
        <h2 className="mt-3 font-sans font-semibold tracking-tight text-3xl md:text-4xl">45 minutos que terminam em algo concreto.</h2>
        <p className="mt-4 text-[hsl(var(--v2-navy-muted))] leading-relaxed">
          Não fica só no que aconteceu. Vai pro que aquilo significa pra você — e quais caminhos existem dali pra frente. A AURA conduz com método, aponta o que pode estar passando despercebido e fecha com uma conclusão clara.
        </p>
        <p className="mt-3 text-[hsl(var(--v2-navy-muted))] leading-relaxed">No final, o resumo fica salvo no seu App para você reler quando precisar.</p>
      </div>
      <SessionSummarySlides />
    </div>
  </section>
);

const Built = () => {
  const b = [
    { icon: MessageCircle, t: "Seu espaço, 24h", d: "A conversa fica em destaque na tela inicial, pronta para o que você estiver sentindo agora." },
    { icon: CalendarHeart, t: "Seu acompanhamento", d: "Encontros marcados, resumos e o que mudou, reunidos num só lugar." },
    { icon: Route, t: "Seu percurso em capítulos", d: "Temas, marcos e trechos das suas próprias palavras formam um capítulo novo a cada mês." },
    { icon: Cloud, t: "Cápsula do tempo", d: "Grave um áudio para o seu eu do futuro e receba de volta, de surpresa, daqui a 3 meses." },
  ];
  return (
    <section id="percurso" className="py-16 md:py-24">
      <div className="container mx-auto px-5 max-w-5xl">
        <div className="text-center max-w-2xl mx-auto">
          <Eyebrow>Uma experiência que cresce com você</Eyebrow>
          <h2 className="mt-3 font-sans font-semibold tracking-tight text-3xl md:text-4xl">A conversa passa. O que ela constrói <span className="italic text-gradient-sage">fica com você.</span></h2>
        </div>
        <div className="mt-10 grid sm:grid-cols-2 gap-4">
          {b.map(({ icon: I, t, d }) => (
            <div key={t} className="flex gap-4 rounded-3xl bg-card border border-border/60 p-6 shadow-sm">
              <div className="w-11 h-11 shrink-0 rounded-2xl bg-[hsl(var(--sage-soft))] flex items-center justify-center"><I className="w-5 h-5 text-primary" /></div>
              <div><h3 className="font-sans font-semibold tracking-tight text-lg">{t}</h3><p className="mt-0.5 text-[13.5px] md:text-sm text-muted-foreground leading-snug">{d}</p></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const PrayerShowcase = () => (
  <section id="oracoes" className="py-16 md:py-24">
    <div className="container mx-auto px-5 max-w-5xl grid md:grid-cols-2 gap-10 items-center">
      <div className="order-2 md:order-1">
        <PrayerSlides onStart={() => document.getElementById("planos")?.scrollIntoView({ behavior: "smooth" })} />
      </div>
      <div className="order-1 md:order-2">
        <Eyebrow>Um momento para você</Eyebrow>
        <h2 className="mt-3 font-sans font-semibold tracking-tight text-3xl md:text-4xl">Orações e meditações guiadas para cada momento do dia.</h2>
        <p className="mt-4 text-muted-foreground leading-relaxed">Na voz acolhedora da AURA, com as frases acompanhando o áudio na tela. Para começar a manhã com força ou entregar à noite o que não depende de você.</p>
      </div>
    </div>
  </section>
);

const Movement = () => (
  <section className="py-16 md:py-24">
    <div className="container mx-auto px-5 max-w-5xl grid md:grid-cols-2 gap-10 items-center">
      <img src={movementImage} alt="Pessoas reunidas pelo Movimento Olá Aura" className="rounded-3xl aspect-[4/3] w-full object-cover" loading="lazy" />
      <div>
        <Eyebrow>Movimento Olá Aura</Eyebrow>
        <h2 className="mt-3 font-sans font-semibold tracking-tight text-3xl md:text-4xl">Compreender a si mesmo não deveria ser privilégio de poucos.</h2>
        <p className="mt-4 text-muted-foreground leading-relaxed">Uma comunidade que acredita que apoio, compreensão e direção precisam chegar a mais gente — sem pressão, sem competição e sem transformar cuidado em venda. Dentro do App, você pode fazer parte com um toque.</p>
        <div className="mt-5 flex items-center gap-2 text-sm font-semibold"><HeartHandshake className="w-5 h-5 text-primary" /> Faça parte de algo maior</div>
      </div>
    </div>
  </section>
);

const Pillars = () => {
  const p = [
    { icon: MessageCircle, t: "Presença que lembra", d: "Converse quando precisar. A AURA guarda seu percurso — você nunca precisa recomeçar a história." },
    { icon: CalendarHeart, t: "Encontros com profundidade", d: "45 minutos com método, nova perspectiva e um resumo escrito para você levar." },
    { icon: Sparkles, t: "Paz em poucos minutos", d: "Orações e meditações guiadas para cada momento do seu dia e da sua noite." },
  ];
  return (
    <section className="py-16 md:py-24">
      <div className="container mx-auto px-5 max-w-5xl">
        <div className="text-center max-w-2xl mx-auto">
          <Eyebrow>Como a AURA ajuda</Eyebrow>
          <h2 className="mt-3 font-sans font-semibold tracking-tight text-3xl md:text-4xl">Três formas de cuidar de você, num só lugar.</h2>
        </div>
        <div className="mt-10 grid md:grid-cols-3 gap-4">
          {p.map(({ icon: I, t, d }) => (
            <div key={t} className="rounded-3xl bg-card border border-border/60 p-6 shadow-sm">
              <div className="w-11 h-11 rounded-2xl bg-[hsl(var(--sage-soft))] flex items-center justify-center"><I className="w-5 h-5 text-primary" /></div>
              <h3 className="mt-4 font-sans font-semibold tracking-tight text-xl">{t}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const Compare = () => {
  const pairs: [string, string][] = [
    ["Às 3h da manhã, a cabeça gira e ninguém responde", "Alguém presente a qualquer hora, por texto ou áudio"],
    ["Você recomeça a explicar tudo do zero", "Ela lembra do que você já contou e conecta os pontos"],
    ["O desabafo alivia, mas nada muda", "Encontros guiados que terminam em direção clara"],
    ["Ajuda parece distante ou cara demais", "Comece por R$ 6,90 na primeira semana"],
  ];
  return (
    <section className="relative overflow-hidden py-16 md:py-24">
      <div aria-hidden className="pointer-events-none absolute top-1/3 -left-24 w-80 h-80 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative container mx-auto px-5 max-w-4xl">
        <h2 className="text-center font-sans font-semibold tracking-tight text-3xl md:text-4xl">Diferente de desabafar <span className="italic text-gradient-sage">no vazio.</span></h2>
        <div className="mt-10 grid md:grid-cols-2 gap-4">
          <div className="rounded-3xl border border-border/40 bg-muted/40 p-6 md:p-7">
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Quando você carrega sozinha</p>
            <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
              {pairs.map(([s]) => <li key={s} className="flex gap-3"><span className="mt-2 w-1.5 h-1.5 shrink-0 rounded-full bg-muted-foreground/40" />{s}</li>)}
            </ul>
          </div>
          <div className="rounded-3xl border border-primary/25 bg-card/70 backdrop-blur-md p-6 md:p-7 shadow-[0_20px_50px_-25px_hsl(var(--primary)/0.45)]">
            <p className="text-[11px] uppercase tracking-[0.2em] text-primary">Com a Aura ao seu lado</p>
            <ul className="mt-4 space-y-3 text-sm">
              {pairs.map(([, a]) => <li key={a} className="flex gap-3"><Check className="mt-0.5 w-4 h-4 shrink-0 text-primary" />{a}</li>)}
            </ul>
          </div>
        </div>
        <div className="mt-8 flex flex-col items-center gap-2"><Cta source="demo" /><Reassure /></div>
      </div>
    </section>
  );
};

const Testimonials = () => {
  const t = [
    { tag: "Ansiedade", q: "Pela primeira vez consegui dormir sem ficar remoendo o dia. Ela me ajudou a enxergar o que eu evitava.", n: "M., 34 anos" },
    { tag: "Relacionamentos", q: "Percebi que eu sempre me colocava por último. O encontro mudou como eu converso com meu marido.", n: "R., 41 anos" },
    { tag: "Sobrecarga", q: "É como ter alguém que lembra de tudo e me devolve com carinho e honestidade.", n: "C., 29 anos" },
  ];
  return (
    <section id="depoimentos" className="relative overflow-hidden py-16 md:py-24">
      <div aria-hidden className="pointer-events-none absolute -top-20 right-0 w-96 h-96 rounded-full bg-accent/20 blur-3xl" />
      <div className="relative container mx-auto px-5 max-w-5xl">
        <div className="text-center"><Eyebrow>Quem já começou</Eyebrow><h2 className="mt-3 font-sans font-semibold tracking-tight text-3xl md:text-4xl">Histórias reais de <span className="italic text-gradient-sage">clareza.</span></h2></div>
        <div className="mt-10 grid md:grid-cols-3 gap-5">
          {t.map((x, idx) => (
            <figure key={x.n} className={`relative rounded-[2rem] bg-card/60 backdrop-blur-md border border-border/40 p-7 shadow-[0_20px_50px_-25px_hsl(var(--primary)/0.35)] flex flex-col ${idx === 1 ? "md:-translate-y-4" : ""}`}>
              <span aria-hidden className="absolute top-3 left-6 font-display text-7xl leading-none text-primary/15">“</span>
              <span className="relative text-[11px] uppercase tracking-[0.2em] text-primary/80">{x.tag}</span>
              <blockquote className="relative mt-4 font-display italic text-xl md:text-[1.35rem] leading-snug flex-1">{x.q}</blockquote>
              <figcaption className="mt-6 pt-4 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground">
                <span>{x.n}</span>
                <span className="flex">{[...Array(5)].map((_, i) => <Star key={i} className="w-3.5 h-3.5 text-primary fill-primary" />)}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
};

const Guarantee = () => (
  <section className="py-14 md:py-20">
    <div className="container mx-auto px-5 max-w-3xl">
      <div className="rounded-3xl border-2 border-primary/30 bg-card p-7 md:p-10 text-center">
        <ShieldCheck className="w-12 h-12 text-primary mx-auto" />
        <h2 className="mt-4 font-sans font-semibold tracking-tight text-2xl md:text-3xl">Risco zero para experimentar.</h2>
        <p className="mt-3 text-muted-foreground text-sm md:text-base max-w-xl mx-auto">
          Use por 7 dias. Se não fizer sentido, cancele em 1 clique no próprio app e peça reembolso. Sem fidelidade, sem letras miúdas.
        </p>
      </div>
    </div>
  </section>
);

const FinalCta = () => (
  <section className="py-20 md:py-28 v2-dark-section text-center">
    <div className="container mx-auto px-5 max-w-2xl">
      <h2 className="font-sans font-semibold tracking-tight text-3xl md:text-5xl leading-tight">Não é apenas sobre atravessar dias difíceis. É sobre <span className="italic text-gradient-sage">quem você está se tornando.</span></h2>
      <div className="mt-8 flex flex-col items-center gap-2"><Cta source="final" /><Reassure dark /></div>
    </div>
  </section>
);

const Sticky = () => {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const hero = document.getElementById("hero-section");
    if (!hero) return;
    const o = new IntersectionObserver(([e]) => setShow(!e.isIntersecting));
    o.observe(hero);
    return () => o.disconnect();
  }, []);
  if (!show) return null;
  return (
    <div className="md:hidden fixed inset-x-0 bottom-0 z-50 p-3 bg-background/90 backdrop-blur-md border-t border-border/50">
      <Link to={checkoutHref("sticky", V)} onClick={() => trackLandingCta("sticky", "Começar por R$ 6,90 (v5)", V)}>
        <Button variant="sage" size="lg" className="w-full rounded-full">Começar por R$ 6,90 · 7 dias</Button>
      </Link>
    </div>
  );
};

const IndexV5 = () => {
  useLandingEngagement(V);
  useEffect(() => {
    trackMetaViewContent({ content_name: "Landing V5", content_category: "homepage_v5" });
    trackViewItem({ item_id: "landing_v5", item_name: "Landing V5" });
  }, []);

  return (
    <>
      <Helmet>
        <title>Olá AURA — Fale com quem lembra de você</title>
        <meta name="description" content="Converse por texto ou áudio a qualquer hora, faça encontros guiados e ouça orações e meditações no app Olá Aura. 7 dias por R$ 6,90." />
        <meta name="robots" content="noindex, nofollow" />
        <meta property="og:title" content="Olá AURA — Fale com quem lembra de você" />
        <meta property="og:description" content="Acolhimento 24h, encontros guiados e orações no app Olá Aura. 7 dias por R$ 6,90." />
        <meta property="og:type" content="website" />
      </Helmet>
      <div className="theme-v2 theme-v5-night min-h-screen bg-background text-foreground antialiased pb-20 md:pb-0">
        <Header />
        <main>
          <Hero />
          <Metrics />
          <div className="v5-cream">
          <Problem />
          <HowItWorks />
          </div>
          <div className="v5-olive">
          <div id="app"><AppTourV2 /></div>
          <SessionShowcase />
          </div>
          <div className="v5-cream">
          <PrayerShowcase />
          <Built />
          <Testimonials />
          </div>
          <div className="v5-navy">
          <Compare />
          <Movement />
          <div id="planos"><PricingV2 /></div>
          <Guarantee />
          <div id="duvidas"><FAQV2 /></div>
          </div>
          <FinalCta />
        </main>
        <nav aria-label="Navegação da página" className="v2-dark-section border-t border-[hsl(var(--v2-navy-foreground)/0.08)]">
          <div className="container mx-auto px-5 py-8 flex flex-col md:flex-row items-center justify-between gap-5">
            <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-[hsl(var(--v2-navy-muted))]">
              <li><a href="#como-funciona" className="hover:text-[hsl(var(--v2-navy-foreground))]">Como funciona</a></li>
              <li><a href="#app" className="hover:text-[hsl(var(--v2-navy-foreground))]">O que tem no App</a></li>
              <li><a href="#planos" className="hover:text-[hsl(var(--v2-navy-foreground))]">Planos</a></li>
              <li><a href="#duvidas" className="hover:text-[hsl(var(--v2-navy-foreground))]">Dúvidas</a></li>
              <li><Link to="/meu-espaco" className="hover:text-[hsl(var(--v2-navy-foreground))]">Já sou assinante · Entrar</Link></li>
            </ul>
            <Link to={checkoutHref("final", V)} onClick={() => trackLandingCta("final", "Rodapé: Experimente 7 dias (v5)", V)}>
              <Button variant="sage" size="sm" className="rounded-full px-6">Experimente 7 dias por R$ 6,90</Button>
            </Link>
          </div>
        </nav>
        <FooterV2 />
        <Sticky />
      </div>
    </>
  );
};

export default IndexV5;
