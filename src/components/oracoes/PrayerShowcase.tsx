import { useRef, useState } from "react";
import { Loader2, Lock, Moon, Pause, Play, Sunrise, Feather, Flame } from "lucide-react";
import { PRAYERS } from "@/lib/prayers";

// Vitrine de orações: só "Sem forças" toca a prévia; as demais levam à assinatura.
const PREVIEW_SECONDS = 60;

const PICKS = [
  { id: "prayer-strength", label: "Sem forças", icon: Feather, free: true },
  { id: "prayer-restless-mind", label: "Mente que não desliga", icon: Moon, free: false },
  { id: "prayer-night", label: "Entregar o dia", icon: Flame, free: false },
  { id: "prayer-morning-guidance", label: "Começar o dia", icon: Sunrise, free: false },
];

const items = PICKS.map((p) => ({ ...p, prayer: PRAYERS.find((x) => x.id === p.id)! })).filter((i) => i.prayer);

export function PrayerShowcase({ onSubscribe }: { onSubscribe?: () => void }) {
  const [tab, setTab] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [time, setTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const { prayer, free } = items[tab];
  const limit = Math.min(PREVIEW_SECONDS, prayer.duration);
  const ended = free && time >= limit;
  const cue = free ? prayer.cues.reduce<string | null>((acc, c) => (time >= c.start ? c.text : acc), null) : null;

  const select = (i: number) => {
    audioRef.current?.pause();
    setPlaying(false); setTime(0); setTab(i);
  };
  const toggle = async () => {
    const a = audioRef.current; if (!a) return;
    if (playing) { a.pause(); setPlaying(false); return; }
    if (a.currentTime >= limit) a.currentTime = 0;
    setLoading(true);
    try { await a.play(); setPlaying(true); } catch { /* bloqueado pelo navegador */ } finally { setLoading(false); }
  };
  const onTime = () => {
    const a = audioRef.current; if (!a) return;
    setTime(a.currentTime);
    if (a.currentTime >= limit) { a.pause(); setPlaying(false); }
  };

  return (
    <div className="overflow-hidden rounded-3xl shadow-2xl">
      <div className="relative isolate min-h-[30rem]">
        <img key={prayer.image} src={prayer.image} alt={prayer.imageAlt} className="absolute inset-0 -z-10 h-full w-full object-cover animate-fade-in" />
        <div className="preview-shade absolute inset-0 -z-10" aria-hidden="true" />
        <div className="preview-copy flex min-h-[30rem] flex-col p-5 sm:p-8">
          <div role="tablist" aria-label="Escolha seu momento" className="flex flex-wrap gap-2">
            {items.map((it, i) => (
              <button key={it.id} role="tab" aria-selected={tab === i} onClick={() => select(i)}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold backdrop-blur transition ${tab === i ? "bg-background text-foreground" : "bg-background/15 text-inherit opacity-85 hover:opacity-100"}`}>
                <it.icon className="h-3.5 w-3.5" />{it.label}{!it.free && <Lock className="h-3 w-3 opacity-70" aria-label="exclusivo para assinantes" />}
              </button>
            ))}
          </div>
          <div className="mt-auto space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-80">{prayer.moment} · voz da AURA</p>
            <h3 className="font-display text-3xl font-medium leading-tight sm:text-4xl">{prayer.title}</h3>
            <p className="min-h-[4.5rem] font-display text-xl italic leading-snug opacity-95" aria-live="polite">
              {ended ? "Para ouvir a oração completa e o acervo diário, comece por R$ 6,90." : cue ? `“${cue}”` : prayer.description}
            </p>
            {free && !ended ? (
              <div className="flex items-center gap-4">
                <button onClick={toggle} aria-label={playing ? "Pausar oração" : "Ouvir oração"}
                  className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:scale-105">
                  {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : playing ? <Pause className="h-6 w-6" fill="currentColor" /> : <Play className="ml-1 h-6 w-6" fill="currentColor" />}
                </button>
                <div className="flex-1">
                  <div className="h-1 overflow-hidden rounded-full bg-background/25"><div className="h-full bg-primary transition-[width]" style={{ width: `${Math.min(100, (time / limit) * 100)}%` }} /></div>
                  <p className="mt-1.5 text-xs opacity-80">{Math.floor(time)}s de {Math.floor(limit)}s · use fones, se puder</p>
                </div>
              </div>
            ) : (
              <button onClick={onSubscribe}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-4 text-sm font-semibold text-primary-foreground shadow-lg transition hover:scale-[1.02]">
                {free ? <Play className="h-4 w-4" fill="currentColor" /> : <Lock className="h-4 w-4" />}
                Ouvir oração completa · Começar por R$ 6,90
              </button>
            )}
          </div>
        </div>
      </div>
      {free && <audio ref={audioRef} key={prayer.audioUrl} src={prayer.audioUrl} preload="none" onTimeUpdate={onTime} onEnded={() => setPlaying(false)} />}
    </div>
  );
}
