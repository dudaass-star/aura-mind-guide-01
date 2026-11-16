import { Helmet } from "react-helmet-async";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "@/styles/v2-theme.css";
import "@/styles/v5-hero.css";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check, MessageCircle, CalendarHeart, Moon } from "lucide-react";
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

const Option = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full text-left rounded-2xl border border-border bg-card px-5 py-4 text-[15px] leading-snug text-foreground transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.99]"
  >
    {label}
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
      const t = setTimeout(() => setStep("result"), 900);
      return () => clearTimeout(t);
    }
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
      <div className="theme-v2 theme-v5-night min-h-screen bg-background text-foreground antialiased">
        <header className="container mx-auto max-w-xl px-5 pt-6 pb-2">
          <img src={logoHorizontal} alt="Olá Aura" className="h-7 w-auto" />
        </header>
        <main className="container mx-auto max-w-xl px-5 py-8 pb-16">
          {step === "intro" && (
            <div className="animate-fade-in pt-6">
              <h1 className="text-3xl md:text-4xl font-semibold leading-tight">
                O que está tirando a sua paz — e por onde começar a mudar isso?
              </h1>
              <p className="mt-5 text-lg text-muted-foreground leading-relaxed">
                Tem situações que a gente vive tantas vezes que acaba se acostumando. Mas isso não significa que precisam continuar assim.
              </p>
              <p className="mt-3 text-lg text-muted-foreground">Responda a 4 perguntas e veja por onde começar.</p>
              <Button variant="sage" size="xl" className="mt-8 w-full rounded-2xl" onClick={() => setStep("theme")}>
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
            <Question title="Se você pudesse começar a cuidar disso hoje, como gostaria de começar?">
              {STARTS.map((s) => (
                <Option key={s.id} label={s.label} onClick={() => { setStart(s.id); setStep("loading"); }} />
              ))}
            </Question>
          )}

          {step === "loading" && (
            <div className="flex flex-col items-center justify-center py-32 animate-fade-in">
              <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <p className="mt-5 text-muted-foreground">Preparando sua leitura…</p>
            </div>
          )}

          {step === "result" && reading && (
            <div className="animate-fade-in space-y-10">
              <section>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Sua leitura com a AURA</p>
                <h1 className="mt-3 text-2xl md:text-3xl font-semibold leading-tight">{reading.title}</h1>
                <div className="mt-5 space-y-4 text-[16px] leading-relaxed text-muted-foreground">
                  <p>{reading.living}</p>
                  <p>{reading.barrier}</p>
                </div>
                <h2 className="mt-7 text-lg font-semibold">Como você pode começar</h2>
                <p className="mt-2 text-[16px] leading-relaxed text-muted-foreground">{reading.start}</p>
              </section>

              <section aria-label="Exemplo de como a conversa pode começar">
                <p className="mb-3 text-sm text-muted-foreground">Exemplo de como seu primeiro encontro pode começar</p>
                <div className="flex gap-3">
                  <img src={avatarAura} alt="AURA" className="h-9 w-9 rounded-full object-cover shrink-0" />
                  <div className="rounded-2xl rounded-tl-sm border border-border bg-card px-4 py-3 text-[15px] leading-relaxed">
                    {reading.opening}
                  </div>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  Sua conversa pode começar por aqui. No seu ritmo, sem precisar explicar tudo de novo.
                </p>
              </section>

              <section className="rounded-3xl border border-border bg-card p-6">
                <p className="text-lg font-semibold">Você não precisa continuar resolvendo tudo sozinha na sua cabeça.</p>
                <ul className="mt-5 space-y-3 text-[15px]">
                  <li className="flex gap-3"><CalendarHeart className="h-5 w-5 text-primary shrink-0" />2 encontros guiados de 45 minutos por mês</li>
                  <li className="flex gap-3"><MessageCircle className="h-5 w-5 text-primary shrink-0" />Conversa por áudio ou texto, a qualquer hora</li>
                  <li className="flex gap-3"><Moon className="h-5 w-5 text-primary shrink-0" />Orações e meditações guiadas</li>
                </ul>
                <div className="mt-6 border-t border-border pt-5">
                  <p className="text-2xl font-semibold">7 dias por R$ 6,90</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Depois, R$ 29,90/mês no plano Essencial, renovado mensalmente. Cancele quando quiser no seu espaço, sem precisar falar com ninguém.
                  </p>
                </div>
                <Link
                  to={`${checkoutHref("final", "quiz")}&plan=essencial&billing=monthly`}
                  onClick={() => trackLandingCta("final", "Quero começar com a AURA (quiz)", V)}
                  className="block mt-6"
                >
                  <Button variant="sage" size="xl" className="w-full rounded-2xl">Quero começar com a AURA</Button>
                </Link>
                <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                  <Check className="h-3.5 w-3.5" /> A AURA é uma inteligência artificial e não substitui psicoterapia.
                </p>
              </section>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
