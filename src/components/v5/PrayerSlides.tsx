import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Feather, Moon, Play, Sunrise, CloudMoon } from "lucide-react";
import { PRAYERS } from "@/lib/prayers";

// Vitrine em slides com trechos reais das orações e a mesma arte do player do App.
const SLIDES = [
  { id: "prayer-strength", label: "Sem forças", icon: Feather, lines: ["Renova minhas forças, Deus.", "Não só para dar conta do que me espera,", "mas para reconhecer o que não cabe mais nas minhas mãos."] },
  { id: "prayer-night", label: "Entregar a noite", icon: Moon, lines: ["Deus, estou aqui.", "O dia terminou, mas algumas coisas continuam acordadas dentro de mim.", "Recebe este dia inteiro."] },
  { id: "prayer-restless-mind", label: "Mente que não para", icon: CloudMoon, lines: ["Meu corpo parou, mas meus pensamentos continuam.", "Que eu consiga enxergar um próximo passo,", "não todos os passos de uma vez."] },
  { id: "prayer-morning-guidance", label: "Começar o dia", icon: Sunrise, lines: ["Deus, mais um dia começa, e eu quero vivê-lo contigo.", "Nem tudo o que faz barulho", "é o que mais importa."] },
].map((s) => ({ ...s, prayer: PRAYERS.find((p) => p.id === s.id)! })).filter((s) => s.prayer);

export default function PrayerSlides({ onStart }: { onStart?: () => void }) {
  const [i, setI] = useState(0);
  const [line, setLine] = useState(0);
  const touch = useRef<number | null>(null);
  const go = (n: number) => { setI((n + SLIDES.length) % SLIDES.length); setLine(0); };

  // Destaca uma frase por vez, como as letras sincronizadas do App.
  useEffect(() => {
    const t = setInterval(() => setLine((l) => (l + 1) % 3), 2600);
    return () => clearInterval(t);
  }, [i]);

  const s = SLIDES[i];
  return (
    <div className="mx-auto w-full max-w-[340px]">
      <div className="relative isolate overflow-hidden rounded-[2rem] shadow-2xl"
        onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
        onTouchEnd={(e) => { if (touch.current == null) return; const d = e.changedTouches[0].clientX - touch.current; if (Math.abs(d) > 40) go(i + (d < 0 ? 1 : -1)); touch.current = null; }}>
        <img key={s.prayer.image} src={s.prayer.image} alt={s.prayer.imageAlt} className="absolute inset-0 -z-10 h-full w-full object-cover animate-fade-in" loading="lazy" />
        <div className="preview-shade absolute inset-0 -z-10" aria-hidden="true" />
        <div key={s.id} className="preview-copy flex h-[min(26rem,68svh)] flex-col justify-end p-5 animate-fade-in">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-80">{s.prayer.moment}</p>
          <h3 className="mt-1.5 font-display text-xl leading-tight">{s.prayer.title}</h3>
          <div className="mt-3 space-y-1.5 font-display text-base leading-snug">
            {s.lines.map((l, n) => (
              <p key={n} className={`transition-opacity duration-700 ${n === line ? "opacity-100" : "opacity-45"}`}>{l}</p>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-4">
            <button onClick={onStart} aria-label="Ouvir orações completas"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:scale-105">
              <Play className="ml-1 h-5 w-5" fill="currentColor" />
            </button>
            <div className="flex-1">
              <div className="h-1 overflow-hidden rounded-full bg-background/25"><div className="h-full bg-primary transition-[width] duration-700" style={{ width: `${((line + 1) / 3) * 100}%` }} /></div>
              <p className="mt-1.5 text-xs opacity-80">Na voz da AURA</p>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <button onClick={() => go(i - 1)} aria-label="Oração anterior" className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card"><ChevronLeft className="h-4 w-4" /></button>
        <div className="flex gap-1.5">
          {SLIDES.map((x, n) => <button key={x.id} onClick={() => go(n)} aria-label={x.label} className={`h-1.5 rounded-full transition-all ${n === i ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30"}`} />)}
        </div>
        <button onClick={() => go(i + 1)} aria-label="Próxima oração" className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card"><ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
