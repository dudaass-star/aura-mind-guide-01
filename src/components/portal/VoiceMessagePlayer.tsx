import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Pause, Play } from "lucide-react";
import avatarAura from "@/assets/avatar-aura.jpg";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface VoiceMessagePlayerProps {
  src: string;
  mine: boolean;
  durationMs?: number | null;
  mimeType?: string;
  /** Busca um link novo (ou regera a voz) quando o arquivo atual não toca mais. */
  onRecover?: () => Promise<string | null>;
}

const SPEEDS = [1, 1.5, 2] as const;

// Ondas da voz: alturas fixas e orgânicas, preenchidas conforme o áudio avança.
const BARS = [30, 52, 70, 45, 85, 62, 40, 75, 95, 58, 36, 68, 88, 50, 72, 42, 80, 60, 34, 66, 90, 54, 38, 64, 46, 28];

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function VoiceMessagePlayer({ src, mine, durationMs, mimeType, onRecover }: VoiceMessagePlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [activeSrc, setActiveSrc] = useState(src);
  const recoveryTriedRef = useRef(false);
  const autoPlayRef = useRef(false);
  const recoveringRef = useRef(false);

  useEffect(() => {
    setActiveSrc(src);
    recoveryTriedRef.current = false;
  }, [src]);

  // Tenta uma única recuperação: link renovado ou voz regerada pelo texto original.
  const recover = async () => {
    if (!onRecover || recoveryTriedRef.current || recoveringRef.current) return false;
    recoveryTriedRef.current = true;
    recoveringRef.current = true;
    setLoading(true);
    setFailed(false);
    try {
      const fresh = await onRecover();
      if (!fresh) return false;
      autoPlayRef.current = true;
      setActiveSrc(fresh);
      return true;
    } catch {
      return false;
    } finally {
      recoveringRef.current = false;
    }
  };
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const knownDuration = durationMs && durationMs > 0 ? durationMs / 1000 : 0;
  const [duration, setDuration] = useState(knownDuration);
  const [currentTime, setCurrentTime] = useState(0);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    setPlaying(false);
    setLoading(false);
    setFailed(false);
    setCurrentTime(0);
    setDuration(knownDuration);
    audio.load();

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration);
      else if (knownDuration > 0) setDuration(knownDuration);
    };
    const finish = () => {
      setPlaying(false);
      setLoading(false);
      setCurrentTime(0);
    };
    const ready = () => {
      setLoading(false);
      setFailed(false);
      if (autoPlayRef.current) {
        autoPlayRef.current = false;
        void audio.play().catch(() => setFailed(true));
      }
    };
    const started = () => {
      setPlaying(true);
      setLoading(false);
      setFailed(false);
    };
    const paused = () => {
      if (!audio.ended) setPlaying(false);
      setLoading(false);
    };
    const wait = () => setLoading(true);
    const fail = () => {
      setPlaying(false);
      void recover().then((ok) => {
        if (!ok) {
          setLoading(false);
          setFailed(true);
        }
      });
    };

    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("loadedmetadata", updateDuration);
    audio.addEventListener("durationchange", updateDuration);
    audio.addEventListener("ended", finish);
    audio.addEventListener("canplay", ready);
    audio.addEventListener("playing", started);
    audio.addEventListener("pause", paused);
    audio.addEventListener("waiting", wait);
    audio.addEventListener("error", fail);

    return () => {
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("loadedmetadata", updateDuration);
      audio.removeEventListener("durationchange", updateDuration);
      audio.removeEventListener("ended", finish);
      audio.removeEventListener("canplay", ready);
      audio.removeEventListener("playing", started);
      audio.removeEventListener("pause", paused);
      audio.removeEventListener("waiting", wait);
      audio.removeEventListener("error", fail);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knownDuration, activeSrc]);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playing) {
      audio.pause();
      setPlaying(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    setFailed(false);
    try {
      if (audio.ended || (duration > 0 && audio.currentTime >= duration)) audio.currentTime = 0;
      await audio.play();
    } catch {
      if (!(await recover())) {
        setFailed(true);
        setLoading(false);
      }
    }
  };

  const changeSpeed = () => {
    const nextIndex = (speedIndex + 1) % SPEEDS.length;
    setSpeedIndex(nextIndex);
    if (audioRef.current) audioRef.current.playbackRate = SPEEDS[nextIndex];
  };

  const elapsed = playing || currentTime > 0 ? currentTime : duration;

  return (
    <div className="flex min-h-10 w-[min(15.5rem,70vw)] max-w-full items-center gap-2" data-voice-message>
      <audio ref={audioRef} preload="metadata" playsInline>
        <source src={activeSrc} type={mimeType} />
      </audio>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={() => void togglePlayback()}
        className={cn(
          "h-9 w-9 shrink-0 rounded-full border-0 shadow-none transition-transform active:scale-95",
          mine ? "bg-primary-foreground/18 text-primary-foreground hover:bg-primary-foreground/25 hover:text-primary-foreground" : "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
        )}
        aria-label={playing ? "Pausar mensagem de voz" : "Reproduzir mensagem de voz"}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
      </Button>

      <div className="min-w-0 flex-1">
        <div className="relative h-5">
          <div className="pointer-events-none absolute inset-0 flex items-center justify-between gap-[2px]" aria-hidden="true">
            {BARS.map((height, index) => {
              const reached = duration > 0 && (index + 0.5) / BARS.length <= currentTime / duration;
              return (
                <span
                  key={index}
                  className={cn(
                    "w-[2.5px] rounded-full transition-colors duration-300",
                    mine
                      ? reached ? "bg-primary-foreground" : "bg-primary-foreground/40"
                      : reached ? "bg-primary" : "bg-primary/25",
                    playing && "portal-voice-bar-live",
                  )}
                  style={{ height: `${height}%`, animationDelay: `${(index % 7) * 110}ms` }}
                />
              );
            })}
          </div>
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.05}
            value={Math.min(currentTime, duration || 1)}
            onChange={(event) => {
              const nextTime = Number(event.target.value);
              setCurrentTime(nextTime);
              if (audioRef.current) audioRef.current.currentTime = nextTime;
            }}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label="Posição da mensagem de voz"
          />
        </div>
        <div className={cn("text-[10.5px] font-semibold leading-tight tabular-nums", mine ? "text-primary-foreground/80" : "text-muted-foreground")}>
          {failed ? "Áudio incompatível" : formatDuration(elapsed)}
        </div>
      </div>

      {/* Foto da Aura em repouso; vira controle de velocidade durante a escuta */}
      {mine || playing || loading ? (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center">{<Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={changeSpeed}
        className={cn(
          "h-7 min-w-9 shrink-0 self-center rounded-full px-2 text-[11px] font-bold shadow-none animate-in fade-in zoom-in-90 duration-200",
          mine ? "bg-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/25 hover:text-primary-foreground" : "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
        )}
        aria-label={`Velocidade ${SPEEDS[speedIndex]} vezes. Toque para alterar`}
      >
        {SPEEDS[speedIndex]}x
      </Button>}</div>
      ) : (
        <div className="relative h-9 w-9 shrink-0 animate-in fade-in zoom-in-90 duration-200">
          <img src={avatarAura} alt="" className="h-9 w-9 rounded-full object-cover" />
          <span className="absolute -bottom-0.5 -left-1 flex h-4 w-4 items-center justify-center rounded-full bg-card text-primary">
            <Mic className="h-2.5 w-2.5" />
          </span>
        </div>
      )}
    </div>
  );
}