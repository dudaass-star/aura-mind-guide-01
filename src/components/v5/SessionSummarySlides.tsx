import { useEffect, useRef, useState } from "react";
import { BookMarked, Check, ChevronLeft, ChevronRight } from "lucide-react";

// Resumos adaptados de encontros reais avaliados com 5 estrelas, sem nomes.
const SLIDES = [
  {
    tag: "Sobrecarga & valor próprio",
    quote: "Você não precisa provar seu valor cuidando de todo mundo para merecer ficar.",
    points: ["Perceber quando o medo de perder decide por você", "Esta semana: dizer um “não” pequeno e observar o que acontece"],
  },
  {
    tag: "Limites com a família",
    quote: "Amar e se importar não significa afundar junto. Proteger o seu fôlego não é abandono.",
    points: ["Notar quando cuidar de todos virou a única forma de se sentir segura", "Hoje: silenciar o que te puxa para o problema dos outros"],
  },
  {
    tag: "Exaustão & autocobrança",
    quote: "O cansaço acumulado não é prova de que você falhou. É o sinal de que chegou no limite.",
    points: ["Parar de medir seu valor pelo quanto aguenta calada", "Hoje: fazer uma única coisa no seu ritmo, sem cobrança"],
  },
  {
    tag: "Relações & parceria",
    quote: "Parceria não é o quanto você aguenta carregar sozinho, mas o que dois sustentam juntos.",
    points: ["Enxergar a diferença entre insistir por amor e por medo", "Deixar o outro com a versão dele e voltar para a sua paz"],
  },
  {
    tag: "Ansiedade & controle",
    quote: "Viver como sentinela de si mesmo cansa mais que qualquer sintoma. Soltar o controle é descanso.",
    points: ["Perceber que o alerta constante gasta a energia de viver", "Hoje: 15 minutos sem fiscalizar o corpo nem a lista"],
  },
];

export default function SessionSummarySlides() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const startX = useRef<number | null>(null);
  const go = (n: number) => setI((n + SLIDES.length) % SLIDES.length);

  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => go(i + 1), 8000);
    return () => clearTimeout(t);
  }, [i, paused]);

  const s = SLIDES[i];
  return (
    <div
      className="rounded-3xl border border-[hsl(var(--v2-navy-foreground)/0.12)] bg-[hsl(var(--v2-navy-foreground)/0.05)] p-6 backdrop-blur select-none"
      onTouchStart={(e) => { startX.current = e.touches[0].clientX; setPaused(true); }}
      onTouchEnd={(e) => {
        if (startX.current === null) return;
        const dx = e.changedTouches[0].clientX - startX.current;
        if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1));
        startX.current = null;
      }}
    >
      <div className="flex items-center justify-between gap-2 text-xs text-primary">
        <span className="flex items-center gap-2"><BookMarked className="w-4 h-4" /> O que levamos deste encontro</span>
        <span className="text-[hsl(var(--v2-navy-muted))]">{i + 1}/{SLIDES.length}</span>
      </div>
      <div key={i} className="min-h-[15.5rem] animate-in fade-in duration-500">
        <p className="mt-4 text-[11px] uppercase tracking-wider text-[hsl(var(--v2-navy-muted))]">{s.tag}</p>
        <p className="mt-2 font-display text-xl leading-snug text-[hsl(var(--v2-navy-foreground))]">“{s.quote}”</p>
        <ul className="mt-5 space-y-2 text-sm text-[hsl(var(--v2-navy-muted))]">
          {s.points.map((p) => (
            <li key={p} className="flex gap-2"><Check className="w-4 h-4 text-primary shrink-0 mt-0.5" /> {p}</li>
          ))}
        </ul>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <button aria-label="Anterior" onClick={() => { setPaused(true); go(i - 1); }} className="w-9 h-9 rounded-full border border-[hsl(var(--v2-navy-foreground)/0.15)] flex items-center justify-center text-[hsl(var(--v2-navy-foreground))]"><ChevronLeft className="w-4 h-4" /></button>
        <div className="flex gap-1.5">
          {SLIDES.map((_, n) => (
            <button key={n} aria-label={`Resumo ${n + 1}`} onClick={() => { setPaused(true); go(n); }} className={`h-1.5 rounded-full transition-all ${n === i ? "w-5 bg-primary" : "w-1.5 bg-[hsl(var(--v2-navy-foreground)/0.25)]"}`} />
          ))}
        </div>
        <button aria-label="Próximo" onClick={() => { setPaused(true); go(i + 1); }} className="w-9 h-9 rounded-full border border-[hsl(var(--v2-navy-foreground)/0.15)] flex items-center justify-center text-[hsl(var(--v2-navy-foreground))]"><ChevronRight className="w-4 h-4" /></button>
      </div>
      <p className="mt-4 text-[11px] text-[hsl(var(--v2-navy-muted))]">Trechos adaptados de encontros reais, sem identificação</p>
    </div>
  );
}
