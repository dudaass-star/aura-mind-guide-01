import { useEffect, useRef, useState } from "react";
import { Headphones, HeartHandshake, Loader2, Pause, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PRAYERS } from "@/lib/prayers";
import stormImage from "@/assets/meditation-storm.jpg";

// Prévia curta para a landing de degustação: a pessoa ouve antes de se cadastrar.
const PREVIEW_SECONDS = 40;
const MEDITATION_ID = "med-ansiedade-tempestade";

type Item = { key: string; label: string; icon: typeof Headphones; title: string; caption: string; image: string; audioUrl?: string; cues?: { start: number; text: string }[] };

const prayer = PRAYERS.find((p) => p.id === "prayer-night") ?? PRAYERS[0];

export function PreviewPlayer() {
  const [medUrl, setMedUrl] = useState<string>();
  const [tab, setTab] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [time, setTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    void supabase.from("meditation_audios").select("public_url").eq("meditation_id", MEDITATION_ID).maybeSingle()
      .then(({ data }) => setMedUrl(data?.public_url ?? undefined));
  }, []);

  const items: Item[] = [
    { key: "prayer", label: "Oração", icon: HeartHandshake, title: prayer.title, caption: "Oração narrada pela AURA", image: prayer.image, audioUrl: prayer.audioUrl, cues: prayer.cues },
    { key: "med", label: "Meditação", icon: Headphones, title: "Quando a mente vira tempestade", caption: "Meditação guiada", image: stormImage, audioUrl: medUrl },
  ];
  const item = items[tab];
  const cue = item.cues?.reduce<string | null>((acc, c) => (time >= c.start ? c.text : acc), null);

  const select = (i: number) => {
    audioRef.current?.pause();
    setPlaying(false); setTime(0); setTab(i);
  };
  const toggle = async () => {
    const a = audioRef.current;
    if (!a || !item.audioUrl) return;
    if (playing) { a.pause(); setPlaying(false); return; }
    if (a.currentTime >= PREVIEW_SECONDS) a.currentTime = 0;
    setLoading(true);
    try { await a.play(); setPlaying(true); } catch { /* bloqueado */ } finally { setLoading(false); }
  };
  const onTime = () => {
    const a = audioRef.current; if (!a) return;
    setTime(a.currentTime);
    if (a.currentTime >= PREVIEW_SECONDS) { a.pause(); setPlaying(false); }
  };
  const progress = Math.min(100, (time / PREVIEW_SECONDS) * 100);

  return (
    <div className="overflow-hidden rounded-2xl shadow-xl">
      <div className="relative isolate min-h-[22rem]">
        <img src={item.image} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover" />
        <div className="preview-shade absolute inset-0 -z-10" aria-hidden="true" />
        <div className="preview-copy flex min-h-[22rem] flex-col p-5 sm:p-7">
          <div role="tablist" className="flex gap-2 self-start rounded-full bg-background/15 p-1 backdrop-blur">
            {items.map((it, i) => (
              <button key={it.key} role="tab" aria-selected={tab === i} onClick={() => select(i)}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${tab === i ? "bg-background text-foreground" : "text-inherit opacity-80"}`}>
                <it.icon className="h-3.5 w-3.5" />{it.label}
              </button>
            ))}
          </div>
          <div className="mt-auto space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-80">Ouça uma prévia · {item.caption}</p>
            <h3 className="font-display text-2xl font-medium leading-tight sm:text-3xl">{item.title}</h3>
            <p className="min-h-[3rem] font-display text-lg italic leading-snug opacity-95" aria-live="polite">
              {cue ? `“${cue}”` : item.key === "med" ? "Respire. Deixe o corpo desacelerar por um instante." : "Dê play e ouça a voz da AURA."}
            </p>
            <div className="flex items-center gap-4">
              <button onClick={toggle} disabled={!item.audioUrl} aria-label={playing ? "Pausar prévia" : "Ouvir prévia"}
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:scale-105 disabled:opacity-60">
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : playing ? <Pause className="h-5 w-5" fill="currentColor" /> : <Play className="ml-0.5 h-5 w-5" fill="currentColor" />}
              </button>
              <div className="flex-1">
                <div className="h-1 overflow-hidden rounded-full bg-background/25"><div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} /></div>
                <p className="mt-1.5 text-xs opacity-80">{Math.floor(time)}s de {PREVIEW_SECONDS}s · prévia</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className="bg-card px-5 py-3 text-center text-sm text-muted-foreground">Esta é só uma amostra. No acesso gratuito você ouve completa.</p>
      {item.audioUrl && <audio ref={audioRef} key={item.audioUrl} src={item.audioUrl} preload="none" onTimeUpdate={onTime} onEnded={() => setPlaying(false)} />}
    </div>
  );
}
