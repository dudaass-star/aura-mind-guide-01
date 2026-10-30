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
  const tab = 0;
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [time, setTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const { prayer, free } = items[tab];
  const limit = Math.min(PREVIEW_SECONDS, prayer.duration);
  const ended = free && time >= limit;
  const cue = free ? prayer.cues.reduce<string | null>((acc, c) => (time >= c.start ? c.text : acc), null) : null;

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
    <div>
      <div className="overflow-hidden rounded-3xl shadow-2xl">
        <div className="relative isolate min-h-[26rem]">
          <img key={prayer.image} src={prayer.image} alt={prayer.imageAlt} className={`absolute inset-0 -z-10 h-full w-full object-cover animate-fade-in ${free ? "" : "scale-105 blur-[2px]"}`} />
          <div className="preview-shade absolute inset-0 -z-10" aria-hidden="true" />
          {!free && (
            <span className="preview-copy absolute right-4 top-4 flex items-center gap-1 rounded-full bg-background/20 px-3 py-1.5 text-[11px] font-semibold backdrop-blur">
              <Lock className="h-3 w-3" /> No acervo completo
            </span>
          )}
          <div className="preview-copy flex min-h-[26rem] flex-col justify-end p-5 sm:p-8">
            <div className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-80">{prayer.moment}</p>
              <h3 className="font-display text-3xl font-medium leading-tight sm:text-4xl">{prayer.title}</h3>
              <p className="min-h-[4.5rem] font-display text-lg italic leading-snug opacity-95 sm:text-xl" aria-live="polite">
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
                    <p className="mt-1.5 text-xs opacity-80">{Math.floor(time)}s de {Math.floor(limit)}s · voz da AURA</p>
                  </div>
                </div>
              ) : (
                <button onClick={onSubscribe}
                  className="flex w-full items-center justify-center gap-3 rounded-2xl bg-primary px-5 py-3.5 text-primary-foreground shadow-lg transition hover:scale-[1.02]">
                  {free ? <Play className="h-4 w-4 shrink-0" fill="currentColor" /> : <Lock className="h-4 w-4 shrink-0" />}
                  <span className="text-left leading-tight">
                    <span className="block text-sm font-semibold">Desbloquear oração completa</span>
                    <span className="block text-xs opacity-85">7 dias por R$ 6,90 · cancele quando quiser</span>
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
        {free && <audio ref={audioRef} key={prayer.audioUrl} src={prayer.audioUrl} preload="none" onTimeUpdate={onTime} onEnded={() => setPlaying(false)} />}
      </div>
      <div className="mt-4 rounded-2xl border border-border bg-card/70 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Outras orações que você desbloqueia no plano</p>
        <ul className="mt-2 divide-y divide-border">
          {items.filter((it) => !it.free).map((it) => (
            <li key={it.id}>
              <button onClick={onSubscribe} className="flex w-full items-center gap-3 py-3 text-left">
                <img src={it.prayer.image} alt="" loading="lazy" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold leading-tight">{it.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{it.prayer.title}</span>
                </span>
                <Lock className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="exclusivo para assinantes" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
