import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Volume2, VolumeX, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackLandingCta, checkoutHref } from "@/lib/landing-analytics";
import tourVideo from "@/assets/videos/tour_app_ola_aura.mp4.asset.json";

// Tour do App em vídeo — substitui a simulação de conversa na V2.
const AppTourV2 = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);

  const toggleSound = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    if (!v.muted) {
      v.currentTime = 0;
      void v.play();
    }
    setMuted(v.muted);
  };

  const restart = () => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = 0;
    void v.play();
  };

  return (
    <section className="relative py-28 md:py-36 bg-background overflow-hidden">
      <div className="absolute top-0 right-0 w-[600px] h-[600px] v2-glow-sage pointer-events-none" />
      <div className="container mx-auto px-6 relative z-10">
        <div className="max-w-2xl mx-auto text-center mb-14">
          <p className="text-sm uppercase tracking-[0.25em] text-primary/80 mb-4">veja na prática</p>
          <h2 className="font-display text-3xl md:text-5xl font-medium leading-[1.15] tracking-tight text-foreground">
            Por dentro do app <span className="text-gradient-sage">Olá Aura</span>
          </h2>
          <p className="mt-5 text-base md:text-lg text-muted-foreground">
            Conversa por texto e áudio, encontros guiados e momentos de oração — tudo num só lugar.
          </p>
        </div>

        <div className="max-w-[340px] mx-auto">
          <div className="relative bg-foreground/90 rounded-[3rem] p-3 shadow-[0_0_60px_hsl(var(--primary)/0.15)]">
            <div className="relative rounded-[2.5rem] overflow-hidden bg-card aspect-[9/16]">
              <video
                ref={videoRef}
                src={tourVideo.url}
                className="absolute inset-0 w-full h-full object-cover"
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                aria-label="Tour do app Olá Aura"
              />
              <div className="absolute bottom-4 right-4 flex gap-2">
                <button
                  onClick={restart}
                  aria-label="Ver do início"
                  className="w-10 h-10 rounded-full bg-background/70 backdrop-blur flex items-center justify-center text-foreground"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  onClick={toggleSound}
                  aria-label={muted ? "Ativar som" : "Desativar som"}
                  className="h-10 px-4 rounded-full bg-background/70 backdrop-blur flex items-center gap-2 text-foreground text-sm"
                >
                  {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  {muted ? "Ouvir" : "Som"}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-col items-center gap-2">
            <Link to={checkoutHref("tour")} onClick={() => trackLandingCta("tour", "Começar por R$ 6,90 (tour v2)")}>
              <Button variant="sage" size="xl" className="rounded-2xl px-10 shadow-lg">
                Começar por R$ 6,90
              </Button>
            </Link>
            <p className="text-xs text-muted-foreground">7 dias por R$ 6,90 · cancela quando quiser</p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AppTourV2;
