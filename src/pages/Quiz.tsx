import { Helmet } from "react-helmet-async";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import "@/styles/v2-theme.css";
import "@/styles/v5-hero.css";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ChevronRight, Check, Sparkles, MessageCircle, CalendarHeart, Moon, Send, Star, ShieldCheck, Mic } from "lucide-react";
import logoHorizontal from "@/assets/logo-ola-aura-horizontal.png";
import avatarAura from "@/assets/avatar-aura.jpg";
import { THEMES, BARRIERS, STARTS, composeReading, type ThemeId } from "@/lib/quiz/content";
import { trackLandingCta, checkoutHref, useLandingEngagement } from "@/lib/landing-analytics";
import { trackMetaViewContent } from "@/lib/meta-pixel";
import { logFunnel } from "@/lib/checkout-funnel";

// Quiz de aquisição (teste A/B contra /v5). As respostas ficam só no aparelho:
// à Meta e ao funil vão apenas eventos de etapa, nunca o conteúdo escolhido.
const V = "quiz" as const;
type Step = "intro" | "theme" | "pattern" | "barrier" | "start" | "loading" | "result";

// Mesmos depoimentos já publicados na /v5.
const TESTIMONIALS = [
  { h: "Parei de me colocar sempre por último.", q: "Percebi que eu sempre me colocava por último. O encontro mudou como eu converso com meu marido.", n: "R., 41 anos", i: "R" },
  { h: "Voltei a dormir sem remoer o dia.", q: "Pela primeira vez consegui dormir sem ficar remoendo o dia. Ela me ajudou a enxergar o que eu evitava.", n: "M., 34 anos", i: "M" },
];
const ctaHref = `${checkoutHref("final", "quiz")}&plan=essencial&billing=monthly`;
const LOADING_STEPS = ["Lendo suas respostas…", "Entendendo o que mais tem te afetado…", "Preparando por onde começar com a AURA…"];

const Loading = () => {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => Math.min(n + 1, LOADING_STEPS.length - 1)), 800);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
      <div className="relative h-24 w-24">
        <div className="v5-halo" />
        <img src={avatarAura} alt="" className="relative h-24 w-24 rounded-full object-cover ring-2 ring-primary/60" />
      </div>
      <div className="mt-8 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary transition-all duration-700" style={{ width: `${((i + 1) / LOADING_STEPS.length) * 100}%` }} />
      </div>
      <ul className="mt-6 space-y-3 text-sm">
        {LOADING_STEPS.map((s, n) => (
          <li key={s} className={`flex items-center gap-2 transition-opacity duration-500 ${n <= i ? "opacity-100" : "opacity-30"}`}>
            {n < i ? <Check className="h-4 w-4 text-primary" /> : <Sparkles className={`h-4 w-4 text-primary ${n === i ? "animate-pulse" : ""}`} />}
            <span className={n <= i ? "text-foreground" : "text-muted-foreground"}>{s}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

const Option = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="group flex w-full items-center gap-3 text-left rounded-2xl border border-border bg-card px-5 py-4 text-[15px] leading-snug text-foreground transition-all hover:border-primary hover:bg-primary/15 hover:shadow-[0_0_22px_-6px_hsl(var(--primary)/0.7)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.98]"
  >
    <span className="flex-1">{label}</span>
    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
  </button>
);

export default function Quiz() {
  useLandingEngagement(V);
  const [step, setStep] = useState<Step>("intro");
  const [theme, setTheme] = useState<ThemeId | null>(null);
  const [pattern, setPattern] = useState<string | null>(null);
  const [barrier, setBarrier] = useState<string | null>(null);
  const [start, setStart] = useState<string | null>(null);

  useEffect(() => {
    trackMetaViewContent({ content_name: "Quiz", content_category: "quiz" });
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    if (step !== "intro") logFunnel("quiz_step", { detail: `quiz_${step}`, meta: { lp: V } });
    if (step === "loading") {
      const t = setTimeout(() => setStep("result"), 2400);
      return () => clearTimeout(t);
    }
  }, [step]);

  const firstCta = useRef<HTMLDivElement>(null);
  const [showSticky, setShowSticky] = useState(false);
  useEffect(() => {
    if (step !== "result") return setShowSticky(false);
    const onScroll = () => {
      const el = firstCta.current;
      setShowSticky(!!el && el.getBoundingClientRect().bottom < 0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [step]);

  const currentTheme = THEMES.find((t) => t.id === theme);
  const reading = useMemo(
    () => (theme && pattern && barrier && start ? composeReading({ theme, pattern, barrier, start }) : null),
    [theme, pattern, barrier, start],
  );

  useEffect(() => {
    if (step === "result" && theme && start) {
      try {
        localStorage.setItem("aura_quiz_focus", JSON.stringify({ theme, start, at: Date.now() }));
      } catch {
        /* noop */
      }
    }
  }, [step, theme, start]);

  const order: Step[] = ["theme", "pattern", "barrier", "start"];
  const idx = order.indexOf(step);
  const back = () => setStep(idx > 0 ? order[idx - 1] : "intro");

  const Progress = () =>
    idx >= 0 ? (
      <div className="mb-8 flex items-center gap-4">
        <button type="button" onClick={back} aria-label="Voltar" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary transition-all duration-500" style={{ width: `${((idx + 1) / 4) * 100}%` }} />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">{idx + 1} de 4</span>
      </div>
    ) : null;

  const Question = ({ title, bridge, children }: { title: string; bridge?: string; children: React.ReactNode }) => (
    <div className="animate-fade-in">
      <Progress />
      {bridge && <p className="mb-3 text-sm italic text-muted-foreground">{bridge}</p>}
      <h1 className="text-2xl md:text-3xl font-semibold leading-tight mb-6">{title}</h1>
      <div className="space-y-3">{children}</div>
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Olá AURA — O que está tirando a sua paz?</title>
        <meta name="description" content="Responda a 4 perguntas e veja por onde começar a mudar o que está tirando a sua paz, com a AURA." />
        <meta name="robots" content="noindex, follow" />
        <meta property="og:title" content="O que está tirando a sua paz — e por onde começar a mudar isso?" />
        <meta property="og:description" content="4 perguntas rápidas e uma leitura feita a partir das suas respostas." />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
      </Helmet>
      <div className="theme-v2 theme-v5-night relative min-h-screen overflow-hidden bg-background text-foreground antialiased">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[640px] overflow-hidden [mask-image:linear-gradient(to_bottom,black_55%,transparent)]">
          <div className="v5-orb v5-orb-a" />
          <div className="v5-orb v5-orb-b" />
          <div className="v5-orb v5-orb-c" />
          <div className="v5-grain" />
        </div>
        <header className="relative container mx-auto max-w-xl px-5 pt-6 pb-2">
          <img src={logoHorizontal} alt="Olá Aura" className="h-7 w-auto brightness-0 invert" />
        </header>
        <main className="relative container mx-auto max-w-xl px-5 py-8 pb-28">
          {step === "intro" && (
            <div className="animate-fade-in pt-4">
              <span className="v5-chip">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" /> Leitura personalizada · menos de 1 min
              </span>
              <h1 className="mt-5 text-[2.1rem] md:text-5xl font-semibold leading-[1.08]">
                O que está tirando a sua paz — <span className="v5-gradient-text">e por onde começar a mudar isso?</span>
              </h1>
              <p className="mt-5 text-lg text-muted-foreground leading-relaxed">
                Tem situações que a gente vive tantas vezes que acaba se acostumando. Mas isso não significa que precisam continuar assim.
              </p>
              <p className="mt-3 text-lg text-muted-foreground">Responda a 4 perguntas e veja por onde começar.</p>
              <Button variant="sage" size="xl" className="v5-shimmer mt-8 w-full rounded-2xl shadow-lg" onClick={() => setStep("theme")}>
                Começar
              </Button>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Leva menos de 1 minuto · Suas respostas ficam neste aparelho e servem só para montar a sua leitura.
              </p>
            </div>
          )}

          {step === "theme" && (
            <Question title="Se você pudesse mudar uma coisa na sua vida hoje, o que faria mais diferença?">
              {THEMES.map((t) => (
                <Option key={t.id} label={t.label} onClick={() => { setTheme(t.id); setPattern(null); setStep("pattern"); }} />
              ))}
            </Question>
          )}

          {step === "pattern" && currentTheme && (
            <Question title="O que mais acontece no seu dia a dia?">
              {currentTheme.patterns.map((p) => (
                <Option key={p.id} label={p.label} onClick={() => { setPattern(p.id); setStep("barrier"); }} />
              ))}
            </Question>
          )}

          {step === "barrier" && (
            <Question title="Quando as coisas ficam difíceis, o que costuma acontecer?" bridge={currentTheme?.bridge}>
              {BARRIERS.map((b) => (
                <Option key={b.id} label={b.label} onClick={() => { setBarrier(b.id); setStep("start"); }} />
              ))}
            </Question>
          )}

          {step === "start" && (
            <Question title="Se você pudesse começar a cuidar de você hoje, o que mais faria diferença?">
              {STARTS.map((s) => (
                <Option key={s.id} label={s.label} onClick={() => { setStart(s.id); setStep("loading"); }} />
              ))}
            </Question>
          )}

          {step === "loading" && <Loading />}

          {step === "result" && reading && (
            <div className="animate-fade-in space-y-10">
              <section>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Sua leitura com a AURA</p>
                <span className="v5-chip mt-3"><Sparkles className="h-3.5 w-3.5 text-primary" /> Padrão identificado: <strong className="font-semibold text-foreground">{reading.patternName}</strong></span>
                <h1 className="mt-3 text-2xl md:text-3xl font-semibold leading-tight v5-gradient-text">{reading.title}</h1>
                <ul className="mt-6 space-y-3">
                  {[
                    { k: "O que está acontecendo", v: reading.living },
                    { k: "Onde você trava", v: reading.barrier },
                    { k: "O que pode ajudar agora", v: reading.start },
                  ].map((x, i) => (
                    <li key={x.k} className={i === 2 ? "rounded-2xl border border-primary/50 bg-primary/10 px-4 py-4 shadow-[0_0_40px_-12px_hsl(var(--primary)/0.6)]" : "rounded-2xl border border-border bg-card px-4 py-4"}>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{x.k}</p>
                      <p className="mt-1.5 text-base font-semibold leading-snug text-foreground">{x.v.head}</p>
                      <p className="mt-1 text-[15px] leading-relaxed text-foreground/80">{x.v.text}</p>
                    </li>
                  ))}
                </ul>
              </section>

              <div className="relative">
              <div className="v5-halo" />
              <section aria-label="Prévia da sua primeira conversa" className="relative overflow-hidden rounded-3xl border border-primary/40 bg-card shadow-[0_30px_60px_-24px_hsl(var(--primary)/0.5)]">
                <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                  <img src={avatarAura} alt="" className="h-9 w-9 rounded-full object-cover ring-2 ring-primary/60" />
                  <div>
                    <p className="text-sm font-semibold leading-none">AURA</p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="h-2 w-2 rounded-full bg-primary animate-pulse" /> online agora
                    </p>
                  </div>
                </div>
                <div className="bg-secondary/40 px-4 py-5">
                  <p className="mb-3 text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Hoje</p>
                  <div className="max-w-[86%] rounded-2xl rounded-tl-sm border border-border/70 bg-card px-3 py-2 shadow-sm v5-pop text-[15px] leading-relaxed">
                    {reading.opening}
                    <span className="mt-0.5 flex justify-end text-[10px] text-muted-foreground">agora</span>
                  </div>
                </div>
                <Link
                  to={ctaHref}
                  onClick={() => trackLandingCta("demo", "Responder à AURA (quiz)", V)}
                  className="flex items-center gap-2 border-t border-border/60 bg-card/95 p-3"
                >
                  <span className="flex flex-1 items-center gap-2 rounded-2xl border border-input bg-secondary/55 p-1.5 shadow-inner">
                    <span className="flex-1 px-2 py-2 text-base text-muted-foreground">Mensagem...</span>
                    <span className="flex h-10 w-10 items-center justify-center text-foreground"><Mic className="h-5 w-5" /></span>
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm"><Send className="h-4 w-4" /></span>
                  </span>
                </Link>
              </section>
              </div>
              <p className="-mt-6 text-center text-xs text-foreground/80">Na sua primeira conversa no App, você pode começar exatamente por esse ponto.</p>

              <div ref={firstCta}>
                <Link to={ctaHref} onClick={() => trackLandingCta("hero", "Continuar a conversa (quiz)", V)} className="block">
                  <Button variant="sage" size="xl" className="v5-shimmer w-full rounded-2xl shadow-lg">Continuar essa conversa</Button>
                </Link>
                <p className="mt-2 text-center text-xs text-muted-foreground">7 dias por R$ 6,90 · cancele quando quiser</p>
              </div>

              <section aria-label="Quem já começou" className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Quem já começou</p>
                {TESTIMONIALS.map((t) => (
                  <figure key={t.n} className="rounded-2xl border border-border bg-card/80 px-4 py-4 backdrop-blur">
                    <div className="flex">{[...Array(5)].map((_, i) => <Star key={i} className="h-3.5 w-3.5 fill-primary text-primary" />)}</div>
                    <p className="mt-2 text-base font-semibold leading-snug text-foreground">{t.h}</p>
                    <blockquote className="mt-1.5 text-[15px] leading-relaxed text-foreground/80">“{t.q}”</blockquote>
                    <figcaption className="mt-3 flex items-center gap-2.5 text-xs text-muted-foreground">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-sm font-semibold text-primary">{t.i}</span>
                      <span><span className="block font-semibold text-foreground">{t.n}</span>Cliente Olá Aura</span>
                    </figcaption>
                  </figure>
                ))}
              </section>

              <section className="relative rounded-3xl border border-primary/40 bg-card p-6 shadow-[0_30px_60px_-28px_hsl(var(--primary)/0.5)]">
                <span className="v5-chip mb-4"><Sparkles className="h-3.5 w-3.5 text-primary" /> Experiência inicial recomendada</span>
                <p className="text-lg font-semibold">Você não precisa continuar resolvendo tudo sozinha na sua cabeça.</p>
                <ul className="mt-5 space-y-3 text-[15px]">
                  <li className="flex gap-3"><CalendarHeart className="h-5 w-5 text-primary shrink-0" /><span><strong className="font-semibold">2 encontros guiados por mês</strong><span className="block text-sm text-foreground/70">45 minutos com foco para clarear o rumo e decidir o que fazer.</span></span></li>
                  <li className="flex gap-3"><MessageCircle className="h-5 w-5 text-primary shrink-0" /><span><strong className="font-semibold">Conversa por áudio ou texto, a qualquer hora</strong><span className="block text-sm text-foreground/70">Desabafe e organize os pensamentos no momento em que precisar.</span></span></li>
                  <li className="flex gap-3"><Moon className="h-5 w-5 text-primary shrink-0" /><span><strong className="font-semibold">Orações e meditações guiadas</strong><span className="block text-sm text-foreground/70">Para desacelerar a cabeça e descansar melhor à noite.</span></span></li>
                </ul>
                <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-2xl border border-border px-3 py-3">
                    <p className="text-muted-foreground">Uma sessão de terapia</p>
                    <p className="mt-1 font-semibold">R$ 150 a 250</p>
                  </div>
                  <div className="rounded-2xl border border-primary px-3 py-3">
                    <p className="text-muted-foreground">AURA, o mês todo</p>
                    <p className="mt-1 font-semibold">cerca de R$ 1 por dia</p>
                  </div>
                </div>
                <div className="mt-6 border-t border-border pt-5">
                  <p className="text-sm text-foreground/80">7 dias de acesso completo</p>
                  <p className="mt-1 text-4xl font-semibold v5-gradient-text">R$ 6,90</p>
                  <p className="mt-1 text-sm text-foreground/80">
                    Depois, R$ 29,90/mês no plano Essencial, renovado mensalmente. Cancele quando quiser no seu espaço, sem precisar falar com ninguém.
                  </p>
                </div>
                <Link to={ctaHref} onClick={() => trackLandingCta("final", "Quero começar com a AURA (quiz)", V)} className="block mt-6">
                  <Button variant="sage" size="xl" className="v5-shimmer w-full rounded-2xl shadow-lg">Começar meus 7 dias</Button>
                </Link>
                <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-foreground/80">
                  <ShieldCheck className="h-4 w-4 text-primary" /> Pagamento seguro · cancele em 1 clique
                </p>
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  A AURA é uma inteligência artificial e não substitui psicoterapia.
                </p>
              </section>
            </div>
          )}
        </main>
        {step === "result" && showSticky && (
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 backdrop-blur animate-fade-in">
            <div className="container mx-auto flex max-w-xl items-center gap-3 px-5 py-3">
              <p className="flex-1 text-sm leading-tight"><span className="font-semibold">7 dias por R$ 6,90</span><br /><span className="text-xs text-muted-foreground">cancele quando quiser</span></p>
              <Link to={ctaHref} onClick={() => trackLandingCta("final", "Barra fixa (quiz)", V)}>
                <Button variant="sage" className="rounded-xl">Começar</Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
