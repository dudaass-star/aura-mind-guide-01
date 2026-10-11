import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronDown, CloudMoon, Compass, Heart, Headphones, Loader2, Moon, Pause, Play, RotateCcw, RotateCw, Sprout, Sunrise, Text } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { PRAYERS, PRAYER_CATEGORIES, type PrayerCategory, type PrayerTrack } from "@/lib/prayers";

const formatTime = (time: number) => `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, "0")}`;
const iconForPrayer = (id: string) => id === "prayer-morning-presence" || id === "prayer-morning-guidance" ? Sunrise : id === "prayer-night" ? Moon : id === "prayer-restless-mind" ? CloudMoon : id === "prayer-loved-ones" || id === "prayer-gratitude" || id === "prayer-life-companions" ? Heart : id === "prayer-strength" || id === "prayer-steps" || id === "prayer-hope" || id === "prayer-flourish" ? Sprout : Compass;

export function OracoesTab({ isActive = true }: { isActive?: boolean }) {
  const [selectedPrayer, setSelectedPrayer] = useState<PrayerTrack | null>(null);
  const [category, setCategory] = useState<PrayerCategory | "Todas">("Todas");
  const visiblePrayers = category === "Todas" ? PRAYERS : PRAYERS.filter((prayer) => prayer.category === category);
  const featuredPrayer = PRAYERS.find((prayer) => prayer.id === "prayer-hope") ?? PRAYERS[0];
  useEffect(() => { if (!isActive) setSelectedPrayer(null); }, [isActive]);
  return <section className="prayer-library space-y-7">
    <div className="space-y-1.5"><p className="text-xs font-semibold text-primary">Sua fé, no seu tempo</p><h2 className="font-display text-3xl leading-tight text-foreground">Um momento com Deus</h2></div>
    {featuredPrayer && <div className="prayer-feature relative isolate -mx-5 overflow-hidden sm:mx-0 sm:rounded-lg">
      <img src={featuredPrayer.image} alt={featuredPrayer.imageAlt} width={1536} height={1024} fetchPriority="high" className="absolute inset-0 h-full w-full object-cover" />
      <div className="prayer-feature-shade absolute inset-0" aria-hidden="true" />
      <div className="prayer-feature-copy relative flex min-h-[19rem] flex-col justify-end gap-3 px-6 pb-6 pt-16 sm:min-h-[22rem] sm:px-8 sm:pb-8">
        <p className="text-xs font-semibold">Um respiro de fé</p>
        <h3 className="max-w-sm font-display text-3xl font-medium leading-tight sm:text-4xl">{featuredPrayer.title}</h3>
        <p className="max-w-sm text-sm leading-relaxed">O bem ainda está presente. A vida ainda pode florescer.</p>
        <div className="mt-1 flex items-center gap-4"><Button className="gap-2 rounded-full px-5" onClick={() => setSelectedPrayer(featuredPrayer)} aria-label={`Ouvir destaque: ${featuredPrayer.title}`}><Play className="h-4 w-4" fill="currentColor" />Ouvir oração</Button><span className="text-xs">{formatTime(featuredPrayer.duration)} · Com a Aura</span></div>
      </div>
    </div>}
    <div className="space-y-4">
      <div className="space-y-3"><h3 className="font-display text-xl font-medium text-foreground">Como está seu coração hoje?</h3>
        <div role="group" aria-label="Temas das orações" className="flex flex-wrap gap-x-1 gap-y-1 border-b border-border pb-3">
          {(["Todas", ...PRAYER_CATEGORIES] as const).map((item) => <Button key={item} variant="ghost" size="sm" className={`min-h-10 rounded-none border-b-2 px-3 ${category === item ? "border-primary font-semibold text-primary" : "border-transparent font-normal text-muted-foreground"}`} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</Button>)}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3"><h4 className="text-sm font-semibold text-foreground">{category === "Todas" ? "Encontre sua oração" : category}</h4><p role="status" className="text-xs tabular-nums text-muted-foreground">{visiblePrayers.length} {visiblePrayers.length === 1 ? "oração" : "orações"}</p></div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:gap-x-5">{visiblePrayers.map((prayer) => {
      return <article key={prayer.id} className="min-w-0">
        <Button variant="ghost" className="group flex h-full w-full flex-col items-stretch justify-start gap-3 whitespace-normal rounded-lg p-0 text-left hover:bg-transparent" onClick={() => setSelectedPrayer(prayer)} aria-label={`Ouvir oração: ${prayer.title}`}>
          <span className="relative block w-full overflow-hidden rounded-lg"><img src={prayer.image} alt={prayer.imageAlt} width={480} height={360} loading="lazy" className="aspect-[4/3] w-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-105" /><span className="absolute bottom-2.5 right-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-background/95 text-primary shadow-sm" aria-hidden="true"><Play className="h-4 w-4" fill="currentColor" /></span></span>
          <span className="block min-w-0 space-y-1.5"><span className="block text-xs font-normal text-primary">{prayer.category} · {formatTime(prayer.duration)}</span><span className="block font-display text-base font-medium leading-snug text-foreground sm:text-xl">{prayer.title}</span><span className="block text-xs font-normal leading-relaxed text-muted-foreground sm:text-sm">{prayer.description}</span></span>
        </Button>
      </article>;
    })}</div></div>
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
  const [lyricsHeight, setLyricsHeight] = useState(0);
  const previousCueRef = useRef<number | null>(null);
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
    if (!container || !showText || !open) return;
    const observer = new ResizeObserver(() => setLyricsHeight(container.clientHeight));
    observer.observe(container);
    return () => observer.disconnect();
  }, [showText, open]);
  useEffect(() => {
    const container = lyricsRef.current;
    const line = container?.querySelector<HTMLElement>(`[data-cue="${activeIndex}"]`);
    const cue = cues[activeIndex];
    if (!container || !line || !cue || !showText || !open) return;
    // Acompanhar frases longas dentro da faixa sem transparência da máscara.
    const visibleTop = container.clientHeight * 0.14;
    const visibleBottom = container.clientHeight * 0.82;
    const visibleHeight = visibleBottom - visibleTop;
    const lineTop = line.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
    const isLong = line.clientHeight > visibleHeight;
    const progress = Math.max(0, Math.min(1, (currentTime - cue.start) / Math.max(0.1, cue.end - cue.start)));
    const top = isLong
      ? lineTop - visibleTop + (line.clientHeight - visibleHeight) * progress
      : lineTop - visibleTop - (visibleHeight - line.clientHeight) / 2;
    const changedCue = previousCueRef.current !== activeIndex;
    previousCueRef.current = activeIndex;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (isLong || changedCue || Math.abs(container.scrollTop - top) > 1 && !playing) {
      container.scrollTo({ top, behavior: !isLong && changedCue && !reducedMotion ? "smooth" : "auto" });
    }
  }, [activeIndex, currentTime, cues, showText, open, lyricsHeight, playing]);
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
