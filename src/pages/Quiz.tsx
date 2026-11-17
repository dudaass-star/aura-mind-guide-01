import { Helmet } from "react-helmet-async";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "@/styles/v2-theme.css";
import "@/styles/v5-hero.css";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ChevronRight, Check, Sparkles, MessageCircle, CalendarHeart, Moon, Send, Star, ShieldCheck, Mic, Award } from "lucide-react";
import logoHorizontal from "@/assets/logo-ola-aura-horizontal.png";
import avatarAura from "@/assets/avatar-aura.jpg";
import { THEMES, BARRIERS, STARTS, composeReading, type ThemeId } from "@/lib/quiz/content";
import { trackLandingCta, checkoutHref, useLandingEngagement } from "@/lib/landing-analytics";
import { trackMetaViewContent } from "@/lib/meta-pixel";
import { logFunnel } from "@/lib/checkout-funnel";

// Pagamento embutido no próprio quiz (mesmo fluxo do CheckoutV2, sem sair da página).
const CheckoutV2 = lazy(() => import("@/pages/CheckoutV2"));

// Quiz de aquisição (teste A/B contra /v5). As respostas ficam só no aparelho:
// à Meta e ao funil vão apenas eventos de etapa, nunca o conteúdo escolhido.
const V = "quiz" as const;
type Step = "intro" | "theme" | "pattern" | "barrier" | "start" | "loading" | "result" | "plans" | "checkout";

// Mesmos depoimentos já publicados na /v5.
const TESTIMONIALS = [
  { h: "Parei de me colocar sempre por último.", q: "Percebi que eu sempre me colocava por último. O encontro mudou como eu converso com meu marido.", n: "R., 41 anos", i: "R" },
  { h: "Voltei a dormir sem remoer o dia.", q: "Pela primeira vez consegui dormir sem ficar remoendo o dia. Ela me ajudou a enxergar o que eu evitava.", n: "M., 34 anos", i: "M" },
];
// Paywall do quiz: ritmo escolhe o plano (quinzenal=Essencial, semanal=Direção); só Mensal e Anual.
// Valores devem acompanhar a tabela do CheckoutV2.
type Rhythm = "quinzenal" | "semanal" | "intensivo";
const PAYWALL = {
  quinzenal: { plan: "essencial", name: "Essencial", sessions: "2 encontros guiados por mês", trial: "6,90", monthly: "29,90", yearlyMonth: "9,90", yearlyTotal: "118,80", off: 67 },
  semanal: { plan: "direcao", name: "Direção", sessions: "4 encontros guiados por mês", trial: "9,90", monthly: "49,90", yearlyMonth: "16,90", yearlyTotal: "202,80", off: 66 },
  intensivo: { plan: "transformacao", name: "Transformação", sessions: "8 encontros guiados por mês", trial: "19,90", monthly: "79,90", yearlyMonth: "26,90", yearlyTotal: "322,80", off: 66 },
} as const;
const planQuery = (plan: string, billing: "monthly" | "yearly") => `?${checkoutHref("final", "quiz").split("?")[1] ?? "lp=quiz"}&plan=${plan}&billing=${billing}`;
const LOADING_STEPS = ["Lendo suas respostas…", "Entendendo o que mais tem te afetado…", "Preparando por onde começar com a AURA…"];

const Loading = () => {
  const [i, setI] = useState(0);
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setPct((n) => Math.min(n + 2, 100)), 44);
    return () => clearInterval(t);
  }, []);
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
      <p className="mt-8 text-4xl font-semibold tabular-nums v5-gradient-text">{pct}%</p>
      <div className="mt-3 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary transition-all duration-100" style={{ width: `${pct}%` }} />
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

const Option = ({ label, onClick }: { label: string; onClick: () => void }) => {
  const [picked, setPicked] = useState(false);
  return (
  <button
    type="button"
    disabled={picked}
    onClick={() => { setPicked(true); setTimeout(onClick, 180); }}
    className={`group ${picked ? "!border-primary !bg-primary/20 shadow-[0_0_26px_-6px_hsl(var(--primary)/0.8)] " : ""} flex w-full items-center gap-3 text-left rounded-2xl border border-border bg-card px-5 py-4 text-[15px] leading-snug text-foreground transition-all hover:border-primary hover:bg-primary/15 hover:shadow-[0_0_22px_-6px_hsl(var(--primary)/0.7)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.98]`}
  >
    <span className="flex-1">{label}</span>
    {picked ? <Check className="h-4 w-4 shrink-0 text-primary" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />}
  </button>
  );
};

export default function Quiz() {
  useLandingEngagement(V);
  const navigate = useNavigate();
  // Estado inicial vem da URL: se já há plano escolhido, abre direto no pagamento (sobrevive a remontagem/refresh)
  const initialChosen = (() => {
    const q = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    const plan = q.get("plan"); const b = q.get("billing");
    return plan && (b === "monthly" || b === "yearly") ? { plan, billing: b as "monthly" | "yearly" } : null;
  })();
  const [step, setStep] = useState<Step>(initialChosen ? "checkout" : "theme");
  const [chosen, setChosen] = useState<{ plan: string; billing: "monthly" | "yearly" } | null>(initialChosen);
  // A escolha vai para o endereço do próprio /quiz: o pagamento lê plano e ciclo dali.
  const goCheckout = (plan: string, b: "monthly" | "yearly") => {
    setChosen({ plan, billing: b });
    navigate(`/quiz${planQuery(plan, b)}`, { replace: true });
    setStep("checkout");
    window.scrollTo({ top: 0 });
  };
  const [theme, setTheme] = useState<ThemeId | null>(null);
  const [pattern, setPattern] = useState<string | null>(null);
  const [barrier, setBarrier] = useState<string | null>(null);
  const [start, setStart] = useState<string | null>(null);

  useEffect(() => {
    trackMetaViewContent({ content_name: "Quiz", content_category: "quiz" });
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    logFunnel("quiz_step", { detail: `quiz_${step}`, meta: { lp: V } });
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
      const of = document.getElementById("oferta");
      const offerVisible = !!of && of.getBoundingClientRect().top < window.innerHeight;
      setShowSticky(!!el && el.getBoundingClientRect().bottom < 0 && !offerVisible);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [step]);

  const [rhythm, setRhythm] = useState<Rhythm>("quinzenal");
  const [moreRhythms, setMoreRhythms] = useState(false);
  const [billing, setBilling] = useState<"monthly" | "yearly">("yearly");
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
  const back = () => idx > 0 && setStep(order[idx - 1]);

  const Progress = () =>
    idx >= 0 ? (
      <div className="mb-8 flex items-center gap-4">
        {idx > 0 ? (
          <button type="button" onClick={back} aria-label="Voltar" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : <span className="w-5" />}
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
          {step === "theme" && (
            <>
              <span className="v5-chip v5-chip-active mb-6 text-[13px]">
                <Award className="h-4 w-4 text-primary" />
                <span>App <strong className="font-semibold">nº 1 do Brasil</strong></span>
              </span>
              <p className="mb-2 text-sm font-medium text-primary">Leitura pessoal em 1 minuto</p>
              <Question title="Se você pudesse mudar uma coisa na sua vida hoje, o que faria mais diferença?">
                {THEMES.map((t) => (
                  <Option key={t.id} label={t.label} onClick={() => { setTheme(t.id); setPattern(null); setStep("pattern"); }} />
                ))}
              </Question>
              <p className="mt-6 text-center text-xs text-muted-foreground">
                Leva menos de 1 minuto · Suas respostas ficam só neste aparelho.
              </p>
            </>
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

          {step === "checkout" && chosen && (
            <div className="animate-fade-in space-y-6 pt-2">
              <button onClick={() => { navigate("/quiz", { replace: true }); setStep("plans"); }} className="flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Trocar plano</button>
              <div>
                <span className="v5-chip"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> Último passo</span>
                <h1 className="mt-4 text-2xl font-semibold leading-tight v5-gradient-text">Ative seu espaço com a AURA</h1>
                {(() => {
                  const c = chosen.plan === "direcao" ? PAYWALL.semanal : chosen.plan === "transformacao" ? PAYWALL.intensivo : PAYWALL.quinzenal;
                  const label = c
                    ? chosen.billing === "yearly" ? `${c.name} Anual · R$ ${c.yearlyMonth}/mês (R$ ${c.yearlyTotal} por ano)` : `${c.name} Mensal · 7 dias por R$ ${c.trial}, depois R$ ${c.monthly}/mês`
                    : "Transformação Mensal";
                  return <p className="mt-3 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm"><span className="text-foreground/70">Plano escolhido: </span><strong className="font-semibold">{label}</strong>
                    <span className="mt-3 block space-y-1.5 text-xs text-foreground/80">
                      {[c ? c.sessions : "8 encontros guiados por mês", "Conversa por áudio e texto a qualquer hora", "Orações e meditações guiadas para desacelerar e descansar"].map((b) => (
                        <span key={b} className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 shrink-0 text-primary" /> {b}</span>
                      ))}
                    </span></p>;
                })()}
              </div>
              <Suspense fallback={<div className="py-16 text-center text-sm text-muted-foreground">Carregando pagamento…</div>}>
                <CheckoutV2 embedded />
              </Suspense>
            </div>
          )}

          {step === "plans" && (
            <div className="animate-fade-in space-y-6 pt-2">
              <button onClick={() => setStep(reading ? "result" : "theme")} className="flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Voltar</button>
              <div>
                <span className="v5-chip"><Sparkles className="h-3.5 w-3.5 text-primary" /> Ativação do seu espaço</span>
                <h1 className="mt-4 text-2xl font-semibold leading-tight v5-gradient-text">Escolha como quer começar com a AURA</h1>
              </div>
              {moreRhythms && (<div>
                <p className="mb-2 text-sm font-semibold">Qual ritmo de encontros você prefere?</p>
                <div className="grid grid-cols-3 gap-2" role="radiogroup">
                  {(["quinzenal", "semanal", "intensivo"] as Rhythm[]).map((r) => (
                    <button key={r} role="radio" aria-checked={rhythm === r} onClick={() => setRhythm(r)}
                      className={`rounded-2xl border px-3 py-3 text-left transition ${rhythm === r ? "border-primary bg-primary/15" : "border-border bg-card/60"}`}>
                      <span className="block text-sm font-semibold">{r === "quinzenal" ? "A cada 15 dias" : r === "semanal" ? "Toda semana" : "2x por semana"}</span>
                      <span className="block text-xs text-foreground/70">{r === "quinzenal" ? "2 encontros/mês" : r === "semanal" ? "4 encontros/mês" : "8 encontros/mês"}</span>
                    </button>
                  ))}
                </div>
              </div>)}
              {(() => {
                const c = PAYWALL[rhythm];
                const opts = [
                  { id: "yearly" as const, title: "Anual", tag: `${c.off}% OFF`, price: `R$ ${c.yearlyMonth}/mês`, note: `R$ ${c.yearlyTotal} cobrados uma vez por ano` },
                  { id: "monthly" as const, title: "Mensal", tag: "7 dias por R$ " + c.trial, price: `R$ ${c.trial} hoje`, note: `Depois, R$ ${c.monthly}/mês · cancele quando quiser` },
                ];
                return (
                  <div className="space-y-3" role="radiogroup" aria-label={`Plano ${c.name}`}>
                    {opts.map((o) => (
                      <button key={o.id} role="radio" aria-checked={billing === o.id} onClick={() => setBilling(o.id)}
                        className={`relative w-full rounded-3xl border p-5 text-left transition ${billing === o.id ? "border-primary bg-card shadow-[0_20px_50px_-24px_hsl(var(--primary)/0.6)]" : "border-border bg-card/60"}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-base font-semibold">{c.name} {o.title}</span>
                          <span className="rounded-full bg-primary/20 px-2.5 py-1 text-xs font-semibold text-primary">{o.tag}</span>
                        </div>
                        <p className="mt-2 text-2xl font-semibold">{o.price}</p>
                        <p className="mt-1 text-sm text-foreground/75">{o.note}</p>
                        <ul className="mt-3 space-y-1.5 text-xs text-foreground/80">
                          {[c.sessions, "Conversa por áudio e texto a qualquer hora", "Todas as orações e meditações guiadas"].map((b) => (
                            <li key={b} className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 shrink-0 text-primary" /> {b}</li>
                          ))}
                        </ul>
                      </button>
                    ))}
                    <Button variant="sage" size="xl" className="v5-shimmer mt-2 w-full rounded-2xl shadow-lg" onClick={() => { trackLandingCta("final", `Paywall ${c.plan} ${billing} (quiz)`, V); goCheckout(c.plan, billing); }}>{billing === "monthly" ? "Começar meus 7 dias" : "Garantir o plano anual"}</Button>
                    <p className="flex items-center justify-center gap-1.5 text-xs text-foreground/80"><ShieldCheck className="h-4 w-4 text-primary" /> Pagamento seguro · cancele em 1 clique</p>
                    {!moreRhythms && (
                      <button onClick={() => setMoreRhythms(true)} className="block w-full pt-2 text-center text-sm text-foreground/70 underline underline-offset-4">Precisa de encontros toda semana? Veja os planos semanais</button>
                    )}
                  </div>
                );
              })()}
            </div>
          )}


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
                  to="#planos" onClick={(e) => { e.preventDefault(); document.getElementById("oferta")?.scrollIntoView({ behavior: "smooth" }); trackLandingCta("demo", "Responder à AURA (quiz)", V); }}
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
                <Link to="#planos" onClick={(e) => { e.preventDefault(); document.getElementById("oferta")?.scrollIntoView({ behavior: "smooth" }); trackLandingCta("hero", "Continuar a conversa (quiz)", V); }} className="block">
                  <Button variant="sage" size="xl" className="v5-shimmer w-full rounded-2xl shadow-lg">Continuar essa conversa</Button>
                </Link>
                <p className="mt-2 text-center text-xs text-muted-foreground">7 dias por R$ 6,90 · cancele quando quiser</p>
              </div>

              <div className="flex items-center justify-center gap-2 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-center text-sm font-medium text-foreground">
                <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
                <span>A plataforma nº 1 do Brasil para entender o que sente e mudar sua vida.</span>
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

              <section id="oferta" className="relative scroll-mt-6 rounded-3xl border border-border bg-card p-6 shadow-xl">
                <span className="v5-chip mb-4"><Sparkles className="h-3.5 w-3.5 text-primary" /> Experiência inicial recomendada</span>
                <p className="text-xl font-semibold">Seu acompanhamento começa agora.</p>
                <p className="mt-1 text-sm text-muted-foreground">Escolha como prefere dar os primeiros passos com a AURA.</p>
                <div className="mt-5 grid grid-cols-2 gap-3" role="radiogroup" aria-label="Plano Essencial">
                  {([
                    { id: "yearly" as const, tag: "★ -67%", name: "Anual", price: "R$ 9,90", unit: "/mês", note: "R$ 118,80/ano · R$ 0,33/dia" },
                    { id: "monthly" as const, tag: "7 dias", name: "Mensal", price: "R$ 6,90", unit: "7 dias", note: "Depois R$ 29,90/mês" },
                  ]).map((o) => {
                    const on = billing === o.id;
                    return (
                      <div key={o.id} role="radio" aria-checked={on} tabIndex={0} onClick={() => setBilling(o.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setBilling(o.id); }}
                        className={`relative cursor-pointer rounded-2xl border-2 px-3 pb-4 pt-6 text-center transition ${on ? "border-primary bg-secondary/40 shadow-lg" : "border-border bg-card/60"}`}>
                        <span className={`absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold ${on ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground/80"}`}>{o.tag}</span>
                        {on && <Check className="absolute right-2 top-2 h-4 w-4 text-primary" />}
                        <p className="text-sm font-semibold">{o.name}</p>
                        <p className="mt-1 text-2xl font-bold tracking-tight">{o.price}</p>
                        <p className="text-xs text-foreground/75">{o.unit}</p>
                        <p className="mt-2 text-[11px] leading-snug text-foreground/65">{o.note}</p>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-5 text-sm font-semibold">Tudo que está incluso:</p>
                <ul className="mt-2 space-y-2 text-sm">
                  {["2 encontros guiados por mês (45 min)", "Conversa por áudio e texto, a qualquer hora", "Todas as orações e meditações guiadas"].map((t) => (
                    <li key={t} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span className="font-medium">{t}</span></li>
                  ))}
                </ul>
                <Button variant="sage" size="xl" className="v5-shimmer mt-5 w-full rounded-2xl shadow-lg"
                  onClick={() => { trackLandingCta("final", `Paywall essencial ${billing} (quiz)`, V); goCheckout("essencial", billing); }}>
                  {billing === "yearly" ? "Garantir o plano anual" : "Começar por R$ 6,90"}
                </Button>
                <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-foreground/80">
                  <ShieldCheck className="h-4 w-4 text-foreground/60" /> Pagamento seguro · cancele em 1 clique
                </p>
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  A Olá AURA não substitui acompanhamento médico ou psicológico.
                </p>
                <button type="button" onClick={() => { setRhythm("semanal"); setMoreRhythms(true); setStep("plans"); }} className="mt-4 block w-full text-center text-sm text-foreground/70 underline underline-offset-4">Precisa de encontros toda semana? Veja os planos semanais</button>
              </section>
            </div>
          )}
        </main>
        {step === "result" && showSticky && (
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 backdrop-blur animate-fade-in">
            <div className="container mx-auto flex max-w-xl items-center gap-3 px-5 py-3">
              <p className="flex-1 text-sm leading-tight"><span className="font-semibold">7 dias por R$ 6,90</span><br /><span className="text-xs text-muted-foreground">cancele quando quiser</span></p>
              <Link to="#planos" onClick={(e) => { e.preventDefault(); document.getElementById("oferta")?.scrollIntoView({ behavior: "smooth" }); trackLandingCta("final", "Barra fixa (quiz)", V); }}>
                <Button variant="sage" className="rounded-xl">Começar</Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
