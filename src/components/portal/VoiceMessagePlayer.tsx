import { useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface VoiceMessagePlayerProps {
  src: string;
  mine: boolean;
}

const SPEEDS = [1, 1.5, 2] as const;

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function VoiceMessagePlayer({ src, mine }: VoiceMessagePlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const finish = () => {
      setPlaying(false);
      setLoading(false);
      setCurrentTime(0);
    };
    const ready = () => {
      setLoading(false);
      setFailed(false);
    };
    const fail = () => {
      setPlaying(false);
      setLoading(false);
      setFailed(true);
    };

    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("loadedmetadata", updateDuration);
    audio.addEventListener("durationchange", updateDuration);
    audio.addEventListener("ended", finish);
    audio.addEventListener("canplay", ready);
    audio.addEventListener("waiting", () => setLoading(true));
    audio.addEventListener("error", fail);

    return () => {
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("loadedmetadata", updateDuration);
      audio.removeEventListener("durationchange", updateDuration);
      audio.removeEventListener("ended", finish);
      audio.removeEventListener("canplay", ready);
      audio.removeEventListener("error", fail);
    };
  }, [src]);

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
      await audio.play();
      setPlaying(true);
      setLoading(false);
    } catch {
      setFailed(true);
      setLoading(false);
    }
  };

  const changeSpeed = () => {
    const nextIndex = (speedIndex + 1) % SPEEDS.length;
    setSpeedIndex(nextIndex);
    if (audioRef.current) audioRef.current.playbackRate = SPEEDS[nextIndex];
  };

  const elapsed = playing || currentTime > 0 ? currentTime : duration;

  return (
    <div className="flex min-h-12 w-[min(17rem,76vw)] max-w-full items-center gap-2.5" data-voice-message>
      <audio ref={audioRef} src={src} preload="metadata" playsInline />
      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={() => void togglePlayback()}
        className={cn(
          "h-10 w-10 shrink-0 rounded-full border-0 shadow-none",
          mine ? "bg-primary-foreground/18 text-primary-foreground hover:bg-primary-foreground/25 hover:text-primary-foreground" : "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
        )}
        aria-label={playing ? "Pausar mensagem de voz" : "Reproduzir mensagem de voz"}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
      </Button>

      <div className="min-w-0 flex-1">
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
          className={cn("portal-voice-progress block h-5 w-full cursor-pointer", mine && "portal-voice-progress-mine")}
          aria-label="Posição da mensagem de voz"
        />
        <div className={cn("mt-0.5 flex items-center justify-between text-[10px] font-semibold tabular-nums", mine ? "text-primary-foreground/80" : "text-muted-foreground")}>
          <span>{failed ? "Não foi possível reproduzir" : formatDuration(elapsed)}</span>
          <span className="font-normal">voz</span>
        </div>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={changeSpeed}
        className={cn(
          "h-8 min-w-8 shrink-0 rounded-full px-1.5 text-[10px] font-bold shadow-none",
          mine ? "text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground" : "text-primary hover:bg-primary/10 hover:text-primary",
        )}
        aria-label={`Velocidade ${SPEEDS[speedIndex]} vezes. Toque para alterar`}
      >
        {SPEEDS[speedIndex]}x
      </Button>
    </div>
  );
}