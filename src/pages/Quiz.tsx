import { Helmet } from "react-helmet-async";
import avatarMariana from "@/assets/avatar-mariana.jpg";
import avatarCarlos from "@/assets/avatar-carlos.jpg";
import avatarJuliana from "@/assets/avatar-juliana.jpg";
import avatarPedro from "@/assets/avatar-pedro.jpg";
import avatarFernanda from "@/assets/avatar-fernanda.jpg";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "@/styles/v2-theme.css";
import "@/styles/v5-hero.css";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check, Sparkles, MessageCircle, CalendarHeart, Moon, Send, Star, ShieldCheck, Mic, Award } from "lucide-react";
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

// Depoimentos do carrossel do resultado (fotos do acervo do projeto).
const TESTIMONIALS = [
  { h: "Parei de me colocar sempre por último.", q: "Percebi que eu sempre engolia o que sentia para não criar atrito. O primeiro encontro já me deu uma clareza que eu não tinha há anos.", n: "Mariana S., 34 anos", m: "Membro há 4 meses", a: avatarMariana },
  { h: "Voltei a dormir sem remoer o dia na cabeça.", q: "Eu deitava exausto, mas a mente não desligava pensando em trabalho e pendências. A AURA me ajudou a organizar o que realmente importava.", n: "Carlos R., 32 anos", m: "Membro há 3 meses", a: avatarCarlos },
  { h: "As perguntas certas que eu fugia de me fazer.", q: "Achei que seria superficial, mas ela vai direto na raiz sem rodeios. Não passa a mão na cabeça, mas acolhe de verdade.", n: "Juliana M., 41 anos", m: "Membro há 5 meses", a: avatarJuliana },
  { h: "Um espaço seguro, sem medo de julgamento.", q: "Sempre tive dificuldade de desabafar e parecer frágil. Poder falar abertamente a qualquer momento mudou o meu ritmo.", n: "Pedro H., 38 anos", m: "Membro há 2 meses", a: avatarPedro },
  { h: "Presença às 2h da manhã, quando a angústia batia.", q: "Não precisar agendar e ter alguém ali no momento exato em que a mente aperta não tem preço.", n: "Fernanda L., 29 anos", m: "Membro há 6 meses", a: avatarFernanda },
];
// Carrossel em rolagem infinita: a lista se repete em cópias e a rolagem desloca
// uma cópia inteira ao encostar nas bordas, dando a sensação de depoimentos contínuos.
const LOOP_COPIES = 3;
const LOOPED_TESTIMONIALS = Array.from({ length: LOOP_COPIES }, (_, c) =>
  TESTIMONIALS.map((t) => ({ ...t, k: `${c}-${t.n}` })),
).flat();
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
    onClick={() => { setPicked(true); setTimeout(onClick, 320); }}
    className={`group flex w-full items-center gap-4 text-left rounded-[20px] border px-5 py-[18px] text-base leading-relaxed transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.985] ${picked ? "border-primary/70 bg-primary/15 text-foreground shadow-[0_8px_30px_-12px_hsl(var(--primary)/0.6)]" : "border-foreground/10 bg-gradient-to-br from-foreground/[0.07] to-foreground/[0.02] text-foreground/90 hover:border-primary/50 hover:bg-primary/10 hover:text-foreground"}`}
  >
    <span className="flex-1">{label}</span>
    <span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-all duration-300 ${picked ? "border-primary bg-primary" : "border-foreground/30 group-hover:border-primary"}`}>
      {picked && <Check className="h-3.5 w-3.5 text-primary-foreground" strokeWidth={3} />}
    </span>
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
  // Respostas salvas na sessão: voltar/refresh nunca reinicia o quiz para a 1ª pergunta
  const saved = (() => {
    try { return JSON.parse(sessionStorage.getItem("aura_quiz_answers") || "null") as { theme: ThemeId; pattern: string; barrier: string; start: string } | null; } catch { return null; }
  })();
  const done = !!(saved?.theme && saved.pattern && saved.barrier && saved.start);
  const [step, setStep] = useState<Step>(initialChosen ? "checkout" : done ? "result" : "theme");
  const [chosen, setChosen] = useState<{ plan: string; billing: "monthly" | "yearly" } | null>(initialChosen);
  // A escolha vai para o endereço do próprio /quiz: o pagamento lê plano e ciclo dali.
  const goCheckout = (plan: string, b: "monthly" | "yearly") => {
    setChosen({ plan, billing: b });
    navigate(`/quiz${planQuery(plan, b)}`, { replace: true });
    setStep("checkout");
    window.scrollTo({ top: 0 });
  };
  const [theme, setTheme] = useState<ThemeId | null>(done ? saved!.theme : null);
  const [pattern, setPattern] = useState<string | null>(done ? saved!.pattern : null);
  const [barrier, setBarrier] = useState<string | null>(done ? saved!.barrier : null);
  const [start, setStart] = useState<string | null>(done ? saved!.start : null);

  useEffect(() => {
    if (theme && pattern && barrier && start) {
      try { sessionStorage.setItem("aura_quiz_answers", JSON.stringify({ theme, pattern, barrier, start })); } catch { /* noop */ }
    }
  }, [theme, pattern, barrier, start]);
  const toOffer = () => {
    setStep("result");
    setTimeout(() => document.getElementById("oferta")?.scrollIntoView({ behavior: "smooth" }), 350);
  };

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

  // Rolagem infinita do carrossel: começa na cópia do meio e, ao tocar as bordas,
  // desloca uma cópia inteira sem animação — o que está na tela não muda.
  const railRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = railRef.current;
    if (!el || step !== "result") return;
    const n = TESTIMONIALS.length;
    const unit = () => {
      const kids = el.children;
      if (kids.length < n * 2) return 0;
      return (kids[n] as HTMLElement).offsetLeft - (kids[0] as HTMLElement).offsetLeft;
    };
    el.scrollLeft = unit();
    let busy = false;
    const onScroll = () => {
      if (busy) return;
      const u = unit();
      if (u <= 0) return;
      if (el.scrollLeft >= u * (LOOP_COPIES - 1) || el.scrollLeft <= 0) {
        busy = true;
        el.scrollLeft += el.scrollLeft <= 0 ? u : -u;
        requestAnimationFrame(() => { busy = false; });
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
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
              <button onClick={() => { navigate("/quiz", { replace: true }); if (reading) toOffer(); else setStep("theme"); }} className="flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Trocar plano</button>
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
              <button onClick={() => (reading ? toOffer() : setStep("theme"))} className="flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> {reading ? "Voltar para o meu resultado" : "Voltar"}</button>
              <div>
                <h1 className="text-2xl font-semibold leading-tight v5-gradient-text">Escolha o ritmo do seu acompanhamento</h1>
                <p className="mt-1 text-sm text-muted-foreground">Todos incluem conversa a qualquer hora, orações e meditações.</p>
              </div>
              <div className="space-y-2" role="radiogroup" aria-label="Ritmo de encontros">
                {([
                  { r: "quinzenal" as Rhythm, freq: "A cada 15 dias · 2 encontros/mês", tag: "Para começar" },
                  { r: "semanal" as Rhythm, freq: "Toda semana · 4 encontros/mês", tag: "★ Mais escolhido" },
                  { r: "intensivo" as Rhythm, freq: "2x por semana · 8 encontros/mês", tag: "Momentos de virada" },
                ]).map(({ r, freq, tag }) => {
                  const on = rhythm === r; const pc = PAYWALL[r];
                  return (
                    <button key={r} role="radio" aria-checked={on} onClick={() => setRhythm(r)}
                      className={`flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left transition ${on ? "border-primary bg-secondary/40 shadow-lg" : "border-border bg-card/60"}`}>
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${on ? "border-primary bg-primary" : "border-foreground/30"}`}>{on && <Check className="h-3 w-3 text-primary-foreground" />}</span>
                      <span className="flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="text-base font-semibold">{pc.name}</span>
                          <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${r === "semanal" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground/80"}`}>{tag}</span></span>
                        <span className="block text-xs text-foreground/70">{freq}</span>
                      </span>
                      <span className="shrink-0 whitespace-nowrap text-right text-xs text-foreground/70">a partir de<br /><strong className="text-sm text-foreground">R$ {pc.yearlyMonth}</strong>/mês</span>
                    </button>
                  );
                })}
              </div>
              {(() => {
                const c = PAYWALL[rhythm];
                const opts = [
                  { id: "yearly" as const, tag: `★ -${c.off}%`, name: "Anual", price: `R$ ${c.yearlyMonth}`, unit: "/mês", note: `R$ ${c.yearlyTotal}/ano` },
                  { id: "monthly" as const, tag: "7 dias", name: "Mensal", price: `R$ ${c.trial}`, unit: "7 dias", note: `Depois R$ ${c.monthly}/mês` },
                ];
                return (
                  <div>
                    <div className="grid grid-cols-2 gap-3 pt-3" role="radiogroup" aria-label={`Ciclo do plano ${c.name}`}>
                      {opts.map((o) => {
                        const on = billing === o.id;
                        return (
                          <button key={o.id} role="radio" aria-checked={on} onClick={() => setBilling(o.id)}
                            className={`relative rounded-2xl border-2 px-3 pb-4 pt-6 text-center transition ${on ? "border-primary bg-secondary/40 shadow-lg" : "border-border bg-card/60"}`}>
                            <span className={`absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold ${on ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground/80"}`}>{o.tag}</span>
                            {on && <Check className="absolute right-2 top-2 h-4 w-4 text-primary" />}
                            <span className="block text-sm font-semibold">{o.name}</span>
                            <span className="mt-1 block text-2xl font-bold tracking-tight">{o.price}</span>
                            <span className="block text-xs text-foreground/75">{o.unit}</span>
                            <span className="mt-2 block text-[11px] leading-snug text-foreground/65">{o.note}</span>
                          </button>
                        );
                      })}
                    </div>
                    <ul className="mt-5 space-y-2 text-sm">
                      {[c.sessions, "Conversa por áudio e texto, a qualquer hora", "Todas as orações e meditações guiadas"].map((t) => (
                        <li key={t} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span className="font-medium">{t}</span></li>
                      ))}
                    </ul>
                    <Button variant="sage" size="xl" className="v5-shimmer mt-5 w-full rounded-2xl shadow-lg" onClick={() => { trackLandingCta("final", `Paywall ${c.plan} ${billing} (quiz)`, V); goCheckout(c.plan, billing); }}>{billing === "monthly" ? `Começar por R$ ${c.trial}` : `Garantir o ${c.name} anual`}</Button>
                    <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-foreground/80"><ShieldCheck className="h-4 w-4 text-foreground/60" /> Pagamento seguro · cancele em 1 clique</p>
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
                <h1 className="mt-4 text-[26px] md:text-3xl font-semibold leading-tight text-foreground">{reading.title}</h1>
                <article className="quiz-dossier mt-6 rounded-3xl px-6 py-6">
                  <p className="quiz-dossier-kicker text-[11px] font-semibold uppercase tracking-[0.2em]">Leitura pessoal · confidencial</p>
                  {[
                    { k: "O que está acontecendo", v: reading.living },
                    { k: "O nó invisível", v: reading.barrier },
                    { k: "A saída", v: reading.start },
                  ].map((x, i) => (
                    <div key={x.k} className={`quiz-dossier-act ${i ? "mt-5 pt-5" : "mt-4"}`}>
                      <p className="quiz-dossier-label text-[13px] font-medium italic"><span className="quiz-dossier-num">{["I", "II", "III"][i]}</span> {x.k}</p>
                      <p className="quiz-dossier-head mt-1.5 text-[19px] font-semibold leading-snug">{x.v.head}</p>
                      <p className="quiz-dossier-text mt-1.5 text-[15px] leading-relaxed">{x.v.text}</p>
                    </div>
                  ))}
                </article>
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
                <Link to="#planos" onClick={(e) => { e.preventDefault(); document.getElementById("oferta")?.scrollIntoView({ behavior: "smooth" }); setBilling("monthly"); trackLandingCta("hero", "Continuar a conversa (quiz)", V); }} className="block">
                  <Button variant="sage" size="xl" className="v5-shimmer w-full rounded-2xl shadow-lg">Converse agora a partir de R$ 6,90</Button>
                </Link>
                <p className="mt-2 text-center text-xs text-muted-foreground">Cancele quando quiser</p>
              </div>

              <div className="flex items-center justify-center gap-2 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-center text-sm font-medium text-foreground">
                <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
                <span>O app nº 1 do Brasil para entender o que sente e mudar sua vida.</span>
              </div>
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
                <div className="mt-5 text-center">
                  <p className="text-sm font-medium text-foreground/90">Gostaria de mais encontros de 45 minutos?</p>
                  <button type="button" onClick={() => { setRhythm("semanal"); setMoreRhythms(true); setStep("plans"); }} className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline">Confira todos os planos disponíveis →</button>
                </div>
                <p className="mt-4 text-center text-xs text-muted-foreground">
                  A Olá AURA não substitui acompanhamento médico ou psicológico.
                </p>
              </section>
              <p className="-mb-6 text-center text-sm font-medium text-foreground/90">Mais de 5.000 pessoas já deram esse passo ↓</p>
              <section aria-label="Quem já começou" className="-mx-5">
                <div className="flex items-end justify-between px-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Quem já começou</p>
                  <p className="text-xs text-muted-foreground">Deslize →</p>
                </div>
                <div ref={railRef} className="mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {LOOPED_TESTIMONIALS.map((t) => (
                    <figure key={t.k} className="flex w-[85%] max-w-[340px] shrink-0 snap-center flex-col rounded-2xl border border-border bg-card/80 px-4 py-4 backdrop-blur">
                      <div className="flex">{[...Array(5)].map((_, i) => <Star key={i} className="h-3.5 w-3.5 fill-primary text-primary" />)}</div>
                      <p className="mt-2 text-base font-semibold leading-snug text-foreground">{t.h}</p>
                      <blockquote className="mt-1.5 flex-1 text-[15px] leading-relaxed text-foreground/80">“{t.q}”</blockquote>
                      <figcaption className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
                        <img src={t.a} alt={t.n} loading="lazy" className="h-10 w-10 rounded-full object-cover ring-2 ring-primary/30" />
                        <span><span className="block text-sm font-semibold text-foreground">{t.n}</span>{t.m}</span>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </section>

            </div>
          )}
        </main>
        {step === "result" && showSticky && (
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 backdrop-blur animate-fade-in">
            <div className="container mx-auto flex max-w-xl items-center gap-3 px-5 py-3">
              <p className="flex-1 text-sm leading-tight"><span className="font-semibold">7 dias por R$ 6,90</span><br /><span className="text-xs text-muted-foreground">cancele quando quiser</span></p>
              <Link to="#planos" onClick={(e) => { e.preventDefault(); document.getElementById("oferta")?.scrollIntoView({ behavior: "smooth" }); setBilling("monthly"); trackLandingCta("final", "Barra fixa (quiz)", V); }}>
                <Button variant="sage" className="rounded-xl">Começar</Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
