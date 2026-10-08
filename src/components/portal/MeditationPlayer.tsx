import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronDown, Headphones, Loader2, Pause, Play, RotateCcw, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

export interface MeditationTrack {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  duration_seconds: number | null;
}

const formatTime = (value: number) => {
  const time = Number.isFinite(value) ? Math.max(0, value) : 0;
  return `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, "0")}`;
};

export function MeditationPlayer({ track, src, image, onClose, onPlay }: {
  track: MeditationTrack;
  src: string;
  image: string;
  onClose: () => void;
  onPlay: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(track.duration_seconds || 0);
  const [error, setError] = useState("");
  const seek = (value: number) => {
    const audio = audioRef.current;
    if (!audio || !duration || audio.readyState === 0) return;
    audio.currentTime = Math.max(0, Math.min(duration, value));
    setTime(audio.currentTime);
  };
  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) { audio.pause(); return; }
    setError(""); setWaiting(true);
    if (audio.error) audio.load();
    if (audio.ended) seek(0);
    try { await audio.play(); } catch { setError("Não foi possível tocar. Tente novamente."); } finally { setWaiting(false); }
  };
  const close = () => { audioRef.current?.pause(); onClose(); };

  return <Dialog.Root open onOpenChange={(open) => { if (!open) close(); }}><Dialog.Portal>
    <Dialog.Overlay className="meditation-player-theme fixed inset-0 z-50 bg-background" />
    <Dialog.Content className="meditation-player-theme meditation-player fixed inset-0 z-50 flex flex-col bg-background text-foreground outline-none" aria-describedby="meditation-player-description">
      <header className="mx-auto flex w-full max-w-xl shrink-0 items-center gap-3 px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <Button size="icon" variant="ghost" onClick={close} aria-label="Fechar meditação" title="Fechar meditação"><ChevronDown /></Button>
        <div className="flex-1 text-center pr-10"><p className="text-xs font-semibold text-primary">Olá Aura</p><p className="text-xs text-muted-foreground">Seu momento de pausa</p></div>
      </header>
      <div className="meditation-player-body mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col justify-center gap-5 overflow-y-auto px-6">
        <img src={image} width={1536} height={1024} alt="Um ambiente tranquilo para a sua pausa" className="meditation-player-cover w-full shrink-0 rounded-lg object-cover" />
        <div className="space-y-2"><Dialog.Title className="font-display text-2xl leading-tight">{track.title}</Dialog.Title><Dialog.Description id="meditation-player-description" className="text-sm leading-relaxed text-muted-foreground">{track.description || "Uma pausa guiada, no seu tempo."}</Dialog.Description><p className="flex items-center gap-2 text-xs text-primary"><Headphones className="h-4 w-4" /> Guiada pela voz da Aura</p></div>
      </div>
      <footer className="mx-auto w-full max-w-xl shrink-0 space-y-4 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5">
        {error && <p role="alert" className="text-center text-sm text-destructive">{error}</p>}
        <Slider value={[time]} min={0} max={duration || 1} step={0.1} disabled={!duration} onValueChange={([value]) => seek(value)} aria-label="Progresso da meditação" />
        <div className="flex justify-between text-xs tabular-nums text-muted-foreground"><span>{formatTime(time)}</span><span>{formatTime(duration)}</span></div>
        <div className="flex items-center justify-center gap-8">
          <Button size="icon" variant="ghost" className="h-12 w-12" onClick={() => seek(time - 10)} aria-label="Voltar 10 segundos" title="Voltar 10 segundos"><RotateCcw /></Button>
          <Button size="icon" className="h-16 w-16 rounded-full [&_svg]:h-7 [&_svg]:w-7" onClick={() => void toggle()} disabled={waiting && !playing} aria-label={playing ? "Pausar meditação" : "Tocar meditação"}>{waiting ? <Loader2 className="animate-spin" /> : playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}</Button>
          <Button size="icon" variant="ghost" className="h-12 w-12" onClick={() => seek(time + 10)} aria-label="Avançar 10 segundos" title="Avançar 10 segundos"><RotateCw /></Button>
        </div>
      </footer>
      <audio ref={audioRef} src={src} preload="metadata" onLoadedMetadata={(event) => { const value = event.currentTarget.duration; if (Number.isFinite(value)) setDuration(value); }} onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)} onPlay={() => { setPlaying(true); onPlay(); }} onPause={() => setPlaying(false)} onWaiting={() => setWaiting(true)} onPlaying={() => setWaiting(false)} onCanPlay={() => setWaiting(false)} onEnded={() => { setPlaying(false); setWaiting(false); }} onError={() => { setPlaying(false); setWaiting(false); setError("Não foi possível carregar a meditação. Tente novamente."); }} />
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}