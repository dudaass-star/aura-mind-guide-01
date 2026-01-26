import { Button } from "@/components/ui/button";
import { Star, Clock, Brain, Volume2, VolumeX, RotateCcw } from "lucide-react";
import { Link } from "react-router-dom";
import { useRef, useState } from "react";

const Hero = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [hasEnded, setHasEnded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const handleVideoReady = () => {
    setIsLoading(false);
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(!isMuted);
    }
  };

  const replayVideo = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play();
      setHasEnded(false);
    }
  };

  const handleVideoEnd = () => {
    setHasEnded(true);
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-hero pt-20">
      {/* Subtle decorative elements */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-sage-soft rounded-full blur-3xl opacity-60 animate-pulse-soft" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-lavender-soft rounded-full blur-3xl opacity-50 animate-pulse-soft delay-200" />
      <div className="absolute top-1/3 right-1/3 w-64 h-64 bg-blush-soft rounded-full blur-3xl opacity-40 animate-pulse-soft delay-300" />

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          {/* Video Container */}
          <div className="relative mb-8 animate-fade-up opacity-0">
            <div className="relative inline-block">
              {/* Video with rounded styling - aspect ratio preserved */}
              <div className="relative w-72 md:w-96 mx-auto rounded-2xl overflow-hidden shadow-2xl ring-4 ring-white/20">
              {/* Loading overlay */}
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-sage-soft via-lavender-soft to-blush-soft">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                    <div className="absolute inset-0 w-16 h-16 rounded-full border-4 border-transparent border-b-accent/50 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
                  </div>
                </div>
              )}
              <video
                ref={videoRef}
                className={`w-full h-auto transition-opacity duration-500 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
                autoPlay
                muted
                playsInline
                preload="auto"
                onCanPlay={handleVideoReady}
                onEnded={handleVideoEnd}
              >
                <source src="/videos/aura-intro.mp4" type="video/mp4" />
              </video>
              
              {/* Video Controls - overlay inside video */}
              <div className="absolute bottom-3 right-3 flex gap-2 rounded-full p-1 bg-black/40 backdrop-blur-sm z-20">
                <button
                  onClick={toggleMute}
                  className="p-2 hover:bg-white/20 rounded-full transition-colors"
                  aria-label={isMuted ? "Ativar som" : "Mutar"}
                >
                  {isMuted ? (
                    <VolumeX className="w-4 h-4 text-white" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-white" />
                  )}
                </button>
                
                {hasEnded && (
                  <button
                    onClick={replayVideo}
                    className="p-2 hover:bg-white/20 rounded-full transition-colors"
                    aria-label="Repetir vídeo"
                  >
                    <RotateCcw className="w-4 h-4 text-white" />
                  </button>
                )}
              </div>
              </div>
            </div>
          </div>

          {/* Simplified headline */}
          <h1 className="font-display text-2xl md:text-3xl lg:text-4xl font-bold leading-tight mb-4 animate-fade-up opacity-0 delay-100">
            <span className="text-gradient-sage">Acompanhamento emocional acessível.</span>
          </h1>

          {/* Subheadline */}
          <p className="font-body text-base md:text-lg text-muted-foreground max-w-2xl mx-auto mb-8 leading-relaxed animate-fade-up opacity-0 delay-200">
            Sessões estruturadas, memória do seu histórico, conteúdo personalizado e suporte 24/7 — por menos de <span className="text-foreground font-semibold">R$2 por dia</span>.
          </p>

          {/* CTA */}
          <div className="flex flex-col items-center gap-4 animate-fade-up opacity-0 delay-300">
            <Link to="/experimentar">
              <Button variant="sage" size="xl" className="min-w-[280px]">
                Começar Grátis
              </Button>
            </Link>
            <p className="text-sm text-muted-foreground">
              5 conversas grátis. Sem cartão. Sem compromisso.
            </p>
          </div>

          {/* Trust badges - more subtle */}
          <div className="flex flex-wrap justify-center gap-4 md:gap-6 text-sm text-muted-foreground mt-10 animate-fade-up opacity-0 delay-400">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
              <span>4.9/5</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              <span>24/7</span>
            </div>
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-accent" />
              <span>Memória de longo prazo</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
