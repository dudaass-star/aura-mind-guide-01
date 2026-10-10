import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronDown, CloudMoon, Compass, Heart, Headphones, Loader2, Moon, Pause, Play, RotateCcw, RotateCw, Sprout, Text } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { PRAYERS, type PrayerTrack } from "@/lib/prayers";

const formatTime = (time: number) => `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, "0")}`;
const iconForPrayer = (id: string) => id === "prayer-night" ? Moon : id === "prayer-restless-mind" ? CloudMoon : id === "prayer-loved-ones" ? Heart : id === "prayer-strength" || id === "prayer-steps" ? Sprout : Compass;

export function OracoesTab({ isActive = true }: { isActive?: boolean }) {
  const [selectedPrayer, setSelectedPrayer] = useState<PrayerTrack | null>(null);
  useEffect(() => { if (!isActive) setSelectedPrayer(null); }, [isActive]);
  return <section className="space-y-6">
    <div className="space-y-2"><p className="text-xs font-semibold text-primary">Um momento com Deus</p><h2 className="font-display text-3xl leading-tight text-foreground">O dia termina.<br />O cuidado permanece.</h2><p className="text-sm text-muted-foreground">Orações cristãs guiadas, no seu tempo.</p></div>
    <div className="grid gap-6 lg:grid-cols-2">{PRAYERS.map((prayer) => {
      const Icon = iconForPrayer(prayer.id);
      return <article key={prayer.id} className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
        <img src={prayer.image} alt={prayer.imageAlt} width={1536} height={1024} loading="lazy" className="aspect-[3/2] w-full object-cover" />
        <div className="flex flex-1 flex-col gap-4 p-5"><p className="flex items-center gap-2 text-xs font-semibold text-primary"><Icon className="h-4 w-4 shrink-0" /> {prayer.moment} <span className="ml-auto shrink-0 text-muted-foreground">{formatTime(prayer.duration)}</span></p><h3 className="font-display text-2xl leading-tight text-foreground">{prayer.title}</h3><p className="text-sm leading-relaxed text-muted-foreground">{prayer.description}</p><Button size="lg" className="mt-auto w-full" onClick={() => setSelectedPrayer(prayer)} aria-label={`Ouvir oração: ${prayer.title}`}><Play /> Ouvir oração</Button></div>
      </article>;
    })}</div>
    {selectedPrayer && <PrayerPlayer key={selectedPrayer.id} prayer={selectedPrayer} open onOpenChange={(value) => { if (!value) setSelectedPrayer(null); }} />}
  </section>;
}

function PrayerPlayer({ prayer, open, onOpenChange }: { prayer: PrayerTrack; open: boolean; onOpenChange: (value: boolean) => void }) {
  const cues = prayer.cues;
  const Icon = iconForPrayer(prayer.id);
  const audioRef = useRef<HTMLAudioElement>(null);
  const lyricsRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(prayer.duration);
  const [showText, setShowText] = useState(true);
  const [error, setError] = useState("");
  const activeIndex = cues.reduce((active, cue, index) => currentTime >= cue.start ? index : active, 0);
  useEffect(() => {
    if (!open) { audioRef.current?.pause(); setPlaying(false); setWaiting(false); setCurrentTime(0); setError(""); }
  }, [open]);
  useEffect(() => {
    const audio = audioRef.current;
    return () => { audio?.pause(); };
  }, []);
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const update = () => { if (audioRef.current) setCurrentTime(audioRef.current.currentTime); frame = requestAnimationFrame(update); };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [playing]);
  useEffect(() => {
    const container = lyricsRef.current;
    const line = container?.querySelector<HTMLElement>(`[data-cue="${activeIndex}"]`);
    if (!container || !line || !showText || !open) return;
    container.scrollTo({ top: line.offsetTop - (container.clientHeight - line.clientHeight) / 2, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [activeIndex, showText, open]);
  const seek = (time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const next = Math.max(0, Math.min(duration, time));
    audio.currentTime = next; setCurrentTime(next);
  };
  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) { audio.pause(); return; }
    setError(""); setWaiting(true);
    if (audio.error) audio.load();
    if (audio.ended) seek(0);
    try { await audio.play(); } catch { setError("Não foi possível tocar a oração. Tente novamente."); } finally { setWaiting(false); }
  };
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal>
    <Dialog.Overlay className="prayer-theme fixed inset-0 z-50 bg-background" />
    <Dialog.Content className="prayer-theme prayer-player fixed inset-0 z-50 flex flex-col bg-background text-foreground outline-none" aria-describedby="prayer-description">
      <header className="mx-auto flex w-full max-w-5xl shrink-0 items-center justify-between gap-3 px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8">
        <Button variant="ghost" size="icon" className="rounded-full" onClick={() => onOpenChange(false)} aria-label="Fechar oração" title="Fechar oração"><ChevronDown /></Button>
        <div className="text-center"><p className="text-xs font-semibold text-primary">Olá Aura</p><p id="prayer-description" className="text-xs text-muted-foreground">{prayer.moment}</p></div>
        <Button variant="ghost" size="icon" className="rounded-full" onClick={() => setShowText((value) => !value)} aria-label={showText ? "Só ouvir" : "Mostrar texto"} title={showText ? "Só ouvir" : "Mostrar texto"} aria-pressed={!showText}>{showText ? <Headphones /> : <Text />}</Button>
      </header>
      <div className={`prayer-body mx-auto grid min-h-0 w-full max-w-5xl flex-1 gap-5 px-6 sm:px-8 ${showText ? "md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] md:gap-12" : "prayer-listen-only"}`}>
        <div className="prayer-artwork flex min-w-0 flex-col justify-center">
          <img src={prayer.image} alt={prayer.imageAlt} width={1536} height={1024} className="prayer-cover w-full rounded-lg object-cover" />
          <div className="mt-4 space-y-2"><p className="flex items-center gap-2 text-xs font-semibold text-primary"><Icon className="h-3.5 w-3.5" /> {prayer.theme}</p><Dialog.Title className="prayer-title font-display text-2xl font-medium leading-tight">{prayer.title}</Dialog.Title><p className="text-xs text-muted-foreground">Oração guiada · Com música suave</p></div>
        </div>
        {showText && <div ref={lyricsRef} className="prayer-lyrics relative min-h-0 overflow-y-auto overscroll-contain" aria-label="Texto da oração"><div className="prayer-lines space-y-5">{cues.map((cue, index) => <Button key={cue.start} data-cue={index} aria-current={index === activeIndex ? "true" : undefined} variant="ghost" className={`prayer-line h-auto w-full justify-start whitespace-normal rounded-lg px-2 py-1 text-left font-display text-xl font-medium leading-relaxed md:text-2xl ${index === activeIndex ? "text-foreground" : "text-muted-foreground"}`} onClick={() => seek(cue.start)} aria-label={`Ir para: ${cue.text}`}>{cue.text}</Button>)}</div></div>}
      </div>
      <footer className="mx-auto w-full max-w-2xl shrink-0 space-y-4 px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 sm:px-8">
        {error && <p role="alert" className="text-center text-sm text-destructive">{error}</p>}
        <div className="space-y-2"><Slider value={[currentTime]} min={0} max={duration} step={0.1} onValueChange={([value]) => seek(value)} aria-label="Progresso da oração" /><div className="flex justify-between text-xs tabular-nums text-muted-foreground"><span>{formatTime(currentTime)}</span><span>{formatTime(duration)}</span></div></div>
        <div className="flex items-center justify-center gap-8">
          <Button variant="ghost" size="icon" className="h-12 w-12 rounded-full" onClick={() => seek(currentTime - 10)} aria-label="Voltar 10 segundos" title="Voltar 10 segundos"><RotateCcw /></Button>
          <Button size="icon" className="h-16 w-16 rounded-full [&_svg]:h-7 [&_svg]:w-7" onClick={() => void togglePlay()} aria-label={playing ? "Pausar oração" : error ? "Tentar tocar novamente" : "Tocar oração"} disabled={waiting && !playing}>{waiting ? <Loader2 className="animate-spin" /> : playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}</Button>
          <Button variant="ghost" size="icon" className="h-12 w-12 rounded-full" onClick={() => seek(currentTime + 10)} aria-label="Avançar 10 segundos" title="Avançar 10 segundos"><RotateCw /></Button>
        </div>
        <div className="flex justify-center"><Button variant="ghost" size="sm" className="gap-2 text-xs text-muted-foreground" onClick={() => setShowText((value) => !value)}>{showText ? <Headphones /> : <Text />}{showText ? "Só ouvir" : "Acompanhar oração"}</Button></div>
      </footer>
      <audio ref={audioRef} src={prayer.audioUrl} preload="metadata" onLoadedMetadata={(event) => { const value = event.currentTarget.duration; if (Number.isFinite(value)) setDuration(value); }} onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onPlaying={() => setWaiting(false)} onWaiting={() => setWaiting(true)} onCanPlay={() => setWaiting(false)} onEnded={() => { setPlaying(false); setWaiting(false); }} onError={() => { setPlaying(false); setWaiting(false); setError("Não foi possível carregar a oração. Tente novamente."); }} />
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
