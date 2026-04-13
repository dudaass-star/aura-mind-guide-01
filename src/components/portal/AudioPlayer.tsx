import { useState, useRef, useEffect, useCallback } from "react";
import { Play, Pause, Loader2 } from "lucide-react";

interface AudioPlayerProps {
  src: string;
  type?: string;
}

function formatTime(seconds: number) {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const AudioPlayer = ({ src, type = "audio/mpeg" }: AudioPlayerProps) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => { if (!isDragging) setCurrentTime(audio.currentTime); };
    const onMeta = () => setDuration(audio.duration);
    const onEnd = () => { setIsPlaying(false); setIsBuffering(false); };
    const onWaiting = () => setIsBuffering(true);
    const onCanPlay = () => setIsBuffering(false);

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("canplay", onCanPlay);

    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("canplay", onCanPlay);
    };
  }, [isDragging]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsBuffering(false);
    } else {
      setIsBuffering(true);
      audio.play().then(() => setIsBuffering(false)).catch(() => setIsBuffering(false));
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = pct * duration;
    setCurrentTime(audio.currentTime);
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-3 bg-muted/40 rounded-2xl px-4 py-3">
      <audio ref={audioRef} preload="none">
        <source src={src} type={type} />
        {type === "audio/ogg" && <source src={src} type="audio/mpeg" />}
      </audio>

      {/* Play/Pause button */}
      <button
        onClick={togglePlay}
        className="w-10 h-10 rounded-full bg-gradient-to-br from-accent to-primary flex items-center justify-center shrink-0 shadow-md hover:scale-105 transition-transform active:scale-95"
        aria-label={isPlaying ? "Pausar" : "Reproduzir"}
      >
        {isBuffering ? (
          <Loader2 size={18} className="text-primary-foreground animate-spin" />
        ) : isPlaying ? (
          <Pause size={18} className="text-primary-foreground" fill="currentColor" />
        ) : (
          <Play size={18} className="text-primary-foreground ml-0.5" fill="currentColor" />
        )}
      </button>

      {/* Time + Progress */}
      <div className="flex-1 min-w-0 space-y-1">
        <div
          className="h-2 bg-border/60 rounded-full cursor-pointer group relative"
          onClick={handleSeek}
          onMouseDown={() => setIsDragging(true)}
          onMouseUp={() => setIsDragging(false)}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent to-primary transition-all relative"
            style={{ width: `${progress}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-primary-foreground border-2 border-accent shadow-sm opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground font-['Nunito'] tabular-nums">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
};

export default AudioPlayer;
