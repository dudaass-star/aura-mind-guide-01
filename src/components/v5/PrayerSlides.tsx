import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Feather, Moon, Pause, Play, Sunrise, CloudMoon, Sparkles } from "lucide-react";
import { PRAYERS } from "@/lib/prayers";

// Vitrine em slides com trechos reais das orações e a mesma arte do player do App.
// Cada frase tem o intervalo [início, fim] em segundos onde é falada no áudio original.
type Seg = [number, number];
const SLIDES = [
  { id: "prayer-strength", label: "Sem forças", icon: Feather, lines: ["Renova minhas forças, Deus.", "Não só para dar conta do que me espera,", "mas para reconhecer o que não cabe mais nas minhas mãos."], segs: [[25.08, 27.4], [28.02, 30.9], [30.9, 34.3]] as Seg[] },
  { id: "prayer-night", label: "Entregar a noite", icon: Moon, lines: ["Deus, estou aqui.", "O dia terminou, mas algumas coisas continuam acordadas dentro de mim.", "Recebe este dia inteiro."], segs: [[0.12, 1.9], [2.42, 7.5], [28.28, 30.4]] as Seg[] },
  { id: "prayer-restless-mind", label: "Mente que não para", icon: CloudMoon, lines: ["Meu corpo parou, mas meus pensamentos continuam.", "Que eu consiga enxergar um próximo passo,", "não todos os passos de uma vez."], segs: [[2.52, 6.3], [34.6, 37.4], [37.4, 39.8]] as Seg[] },
  { id: "prayer-morning-guidance", label: "Começar o dia", icon: Sunrise, lines: ["Deus, mais um dia começa, e eu quero vivê-lo contigo.", "Nem tudo o que faz barulho", "é o que mais importa."], segs: [[0, 6.34], [35.52, 37.5], [37.5, 39.9]] as Seg[] },
].map((s) => ({ ...s, prayer: PRAYERS.find((p) => p.id === s.id)! })).filter((s) => s.prayer);

type Status = "idle" | "playing" | "paused" | "ended";

export default function PrayerSlides({ onStart }: { onStart?: () => void }) {
  const [i, setI] = useState(0);
  const [line, setLine] = useState(0);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const touch = useRef<number | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const seg = useRef(0);
  const raf = useRef<number>();

  const s = SLIDES[i];

  const stop = () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    audio.current?.pause();
  };

  const go = (n: number) => {
    stop();
    setI((n + SLIDES.length) % SLIDES.length);
    setLine(0); setStatus("idle"); setProgress(0); seg.current = 0;
  };

  useEffect(() => () => stop(), []);

  // Sem áudio, destaca uma frase por vez como as letras do App.
  useEffect(() => {
    if (status !== "idle") return;
    const t = setInterval(() => setLine((l) => (l + 1) % 3), 2600);
    return () => clearInterval(t);
  }, [i, status]);

  const total = s.segs.reduce((a, [x, y]) => a + (y - x), 0);

  const tick = () => {
    const a = audio.current; if (!a) return;
    let k = seg.current;
    const [, end] = s.segs[k];
    if (a.currentTime >= end) {
      k += 1;
      if (k >= s.segs.length) {
        a.pause(); setStatus("ended"); setProgress(1); return;
      }
      seg.current = k; a.currentTime = s.segs[k][0];
    }
    setLine(k);
    const done = s.segs.slice(0, k).reduce((acc, [x, y]) => acc + (y - x), 0) + Math.max(0, a.currentTime - s.segs[k][0]);
    setProgress(Math.min(1, done / total));
    // Fade suave no final do último trecho.
    const last = k === s.segs.length - 1;
    a.volume = last ? Math.max(0, Math.min(1, (s.segs[k][1] - a.currentTime) / 0.6)) : 1;
    raf.current = requestAnimationFrame(tick);
  };

  const toggle = async () => {
    if (status === "ended") { onStart?.(); return; }
    if (status === "playing") { stop(); setStatus("paused"); return; }
    if (!audio.current) audio.current = new Audio();
    const a = audio.current;
    if (status === "idle") {
      a.src = s.prayer.audioUrl; seg.current = 0; setLine(0);
      a.currentTime = s.segs[0][0];
    }
    a.volume = 1;
    try {
      await a.play();
      if (status === "idle" && Math.abs(a.currentTime - s.segs[0][0]) > 0.5) a.currentTime = s.segs[0][0];
      setStatus("playing");
      raf.current = requestAnimationFrame(tick);
    } catch { setStatus("idle"); }
  };

  const ended = status === "ended";
  const pct = status === "idle" ? ((line + 1) / 3) * 100 : progress * 100;

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
              <p key={n} className={`transition-opacity duration-700 ${ended || n === line ? "opacity-100" : "opacity-45"}`}>{l}</p>
            ))}
          </div>
          {ended ? (
            <div className="mt-4 animate-fade-in">
              <p className="mb-2.5 text-xs opacity-90">Continue ouvindo esta e outras orações completas na voz da AURA.</p>
              <button onClick={onStart}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-lg ring-4 ring-primary/30 transition hover:scale-[1.02] animate-pulse">
                <Sparkles className="h-4 w-4" /> Ouvir completa · 7 dias por R$ 6,90
              </button>
            </div>
          ) : (
            <div className="mt-4 flex items-center gap-4">
              <button onClick={toggle} aria-label={status === "playing" ? "Pausar trecho" : "Ouvir trecho da oração"}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:scale-105">
                {status === "playing" ? <Pause className="h-5 w-5" fill="currentColor" /> : <Play className="ml-1 h-5 w-5" fill="currentColor" />}
              </button>
              <div className="flex-1">
                <div className="h-1 overflow-hidden rounded-full bg-background/25"><div className={`h-full bg-primary ${status === "idle" ? "transition-[width] duration-700" : ""}`} style={{ width: `${pct}%` }} /></div>
                <p className="mt-1.5 text-xs opacity-80">{status === "idle" ? "Toque para ouvir na voz da AURA" : "Na voz da AURA"}</p>
              </div>
            </div>
          )}
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
