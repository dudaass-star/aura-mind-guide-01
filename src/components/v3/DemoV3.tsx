import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Smartphone, Play, Pause, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackLandingCta, checkoutHref } from "@/lib/landing-analytics";
import avatarAura from "@/assets/avatar-aura.jpg";

interface Message {
  sender: "user" | "aura";
  content: string;
  time?: string;
  isAudioOnly?: boolean;
  isFirstInSequence?: boolean;
}

const messages: Message[] = [
  {
    sender: "user",
    content: "Tenho 28 anos e ainda não sei o que quero da vida. Todo mundo parece ter um caminho, menos eu.",
    time: "21:32",
    isFirstInSequence: true,
  },
  { sender: "aura", content: "Esse peso de \"todo mundo parece saber\" é muito real...", isFirstInSequence: true },
  { sender: "aura", content: "...e muito injusto com você mesma" },
  { sender: "aura", content: "Me conta: quando você diz que não sabe o que quer, é sobre trabalho? Relacionamentos? Ou é algo mais fundo?", time: "21:32" },
  { sender: "user", content: "É tudo. Sinto que to só existindo, sabe? Não vivendo de verdade.", time: "21:33", isFirstInSequence: true },
  { sender: "aura", content: "\"Só existindo\"...", isFirstInSequence: true },
  { sender: "aura", content: "isso diz muito" },
  { sender: "aura", content: "Deixa eu te perguntar uma coisa: teve algum momento recente, mesmo que pequeno, em que você sentiu que estava vivendo de verdade?" },
  { sender: "aura", content: "Pode ser algo simples", time: "21:33" },
  { sender: "user", content: "Semana passada eu passei a tarde toda desenhando. Nem vi o tempo passar.", time: "21:34", isFirstInSequence: true },
  { sender: "aura", content: "Olha só o que você acabou de me mostrar...", isFirstInSequence: true },
  { sender: "aura", content: "Você diz que não sabe o que quer" },
  { sender: "aura", content: "mas seu corpo sabe" },
  { sender: "aura", content: "Ele te levou pra um lugar onde o tempo sumiu" },
  { sender: "aura", content: "Isso não é \"só existir\"" },
  { sender: "aura", content: "Isso é uma pista enorme." },
  { sender: "aura", content: "E lembra que em março você me disse que \"nada mais te empolgava\"?" },
  { sender: "aura", content: "Eu guardei isso. Hoje você me trouxe uma tarde inteira que passou voando." },
  { sender: "aura", content: "", time: "21:34", isAudioOnly: true },
];

const TypingIndicator = () => (
  <div className="flex justify-start">
    <div className="bg-card border border-border/60 rounded-3xl rounded-bl-md px-4 py-3 flex items-center gap-1">
      <div className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-typing-dot" />
      <div className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-typing-dot delay-150" />
      <div className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-typing-dot delay-300" />
    </div>
  </div>
);

const WhatsAppVoiceMessage = ({
  isPlaying,
  onToggle,
  duration = "0:04",
  currentTime = 0,
  totalDuration = 4,
}: {
  isPlaying: boolean;
  onToggle: () => void;
  duration?: string;
  currentTime?: number;
  totalDuration?: number;
}) => {
  const waveformBars = [
    4, 8, 5, 12, 6, 14, 8, 10, 5, 16, 12, 8, 14, 6, 10, 8, 12, 5, 14, 8,
    6, 10, 12, 8, 5, 14, 10, 6, 12, 8, 4, 10, 8, 6, 4,
  ];
  const progress = (currentTime / totalDuration) * 100;

  return (
    <div className="flex items-center gap-2 mt-2 py-1">
      <button
        onClick={onToggle}
        className="w-10 h-10 rounded-full bg-primary flex items-center justify-center flex-shrink-0 hover:bg-primary/90 transition-colors"
        aria-label={isPlaying ? "Pausar áudio" : "Reproduzir áudio"}
      >
        {isPlaying ? (
          <Pause className="w-5 h-5 text-primary-foreground" fill="currentColor" />
        ) : (
          <Play className="w-5 h-5 text-primary-foreground ml-0.5" fill="currentColor" />
        )}
      </button>

      <div className="flex-1 flex flex-col gap-1">
        <div className="flex items-center gap-[2px] h-6 relative">
          {waveformBars.map((height, i) => {
            const barProgress = (i / waveformBars.length) * 100;
            const isPlayed = barProgress <= progress;
            return (
              <div
                key={i}
                className={`w-[3px] rounded-full transition-all duration-150 ${
                  isPlayed ? "bg-primary" : "bg-muted-foreground/40"
                } ${isPlaying && isPlayed ? "animate-waveform-pulse" : ""}`}
                style={{ height: `${height}px`, animationDelay: `${i * 0.02}s` }}
              />
            );
          })}
        </div>
        <span className="text-[10px] text-muted-foreground">
          {isPlaying ? `0:0${Math.floor(currentTime)}` : duration}
        </span>
      </div>

      <img
        src={avatarAura}
        alt="Aura"
        className="w-10 h-10 rounded-full object-cover flex-shrink-0 border-2 border-primary/20"
      />
    </div>
  );
};

const DemoV3 = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [visibleMessages, setVisibleMessages] = useState(1);
  const [isTyping, setIsTyping] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [visibleMessages, isTyping]);

  const calculateTypingDelay = (content: string): number => {
    const length = content.length;
    if (length < 50) return Math.min(4000, 2000 + length * 40);
    if (length < 100) return Math.min(5500, 3000 + length * 25);
    return Math.min(6000, 4000 + length * 20);
  };

  const humanizeDelay = (baseDelay: number): number => baseDelay * (0.8 + Math.random() * 0.4);

  useEffect(() => {
    if (!isPlaying || visibleMessages >= messages.length) {
      if (visibleMessages >= messages.length) {
        setIsComplete(true);
        setIsPlaying(false);
      }
      return;
    }

    const nextMessage = messages[visibleMessages];
    const isAuraMessage = nextMessage.sender === "aura";
    const isFirstInSequence = nextMessage.isFirstInSequence === true;

    let typingTimeout: ReturnType<typeof setTimeout>;
    let messageTimeout: ReturnType<typeof setTimeout>;

    if (isAuraMessage) {
      if (isFirstInSequence) {
        const readingDelay = humanizeDelay(3000);
        const typingDuration = calculateTypingDelay(nextMessage.content);
        typingTimeout = setTimeout(() => setIsTyping(true), readingDelay);
        messageTimeout = setTimeout(() => {
          setIsTyping(false);
          setVisibleMessages((prev) => prev + 1);
        }, readingDelay + typingDuration);
      } else {
        const bubbleDelay = humanizeDelay(1500);
        messageTimeout = setTimeout(() => setVisibleMessages((prev) => prev + 1), bubbleDelay);
      }
    } else {
      const userDelay = humanizeDelay(3000);
      messageTimeout = setTimeout(() => setVisibleMessages((prev) => prev + 1), userDelay);
    }

    return () => {
      clearTimeout(typingTimeout);
      clearTimeout(messageTimeout);
    };
  }, [isPlaying, visibleMessages]);

  const handleStartConversation = () => {
    setIsPlaying(true);
    setVisibleMessages(1);
    setIsComplete(false);
    setIsAudioPlaying(false);
  };

  const handleRestart = () => {
    setVisibleMessages(1);
    setIsPlaying(false);
    setIsTyping(false);
    setIsComplete(false);
    setIsAudioPlaying(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };

  const handleAudioToggle = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(
        "https://uhyogifgmutfmbyhzzyo.supabase.co/storage/v1/object/public/meditations/demo/aura-voice.mp3",
      );
      audioRef.current.onended = () => setIsAudioPlaying(false);
    }
    if (isAudioPlaying) {
      audioRef.current.pause();
      setIsAudioPlaying(false);
    } else {
      audioRef.current.play().catch(() => {
        console.log("Audio file not available");
      });
      setIsAudioPlaying(true);
    }
  };

  const showStartButton = !isPlaying && visibleMessages === 1 && !isComplete;
  const showRestartButton = isComplete || (!isPlaying && visibleMessages > 1);

  const isPartOfSequence = (index: number) => {
    if (index === 0) return false;
    const current = messages[index];
    const previous = messages[index - 1];
    return current.sender === previous.sender && !current.isFirstInSequence;
  };

  const isLastInSequence = (index: number) => {
    if (index >= messages.length - 1) return true;
    const current = messages[index];
    const next = messages[index + 1];
    return current.sender !== next.sender || next.isFirstInSequence === true;
  };

  return (
    <section className="relative py-28 md:py-36 bg-background overflow-hidden">
      <div className="absolute top-0 right-0 w-[600px] h-[600px] v2-glow-sage pointer-events-none" />

      <div className="container mx-auto px-6 relative z-10">
        <div className="max-w-2xl mx-auto text-center mb-16">
          <p className="text-sm uppercase tracking-[0.25em] text-primary/80 mb-4">veja na prática</p>
          <h2 className="font-display text-3xl md:text-5xl font-medium leading-[1.15] tracking-tight text-foreground">
            Como é conversar com a{" "}
            <span className="text-gradient-sage">Aura</span>
          </h2>
          <p className="mt-5 text-base md:text-lg text-muted-foreground">
            Uma conversa real que mostra como a Aura te ajuda a enxergar o que você não vê.
          </p>
        </div>

        <div className="max-w-md mx-auto">
          <div className="relative">
            <div className="bg-foreground/90 rounded-[3rem] p-3 shadow-[0_0_60px_hsl(var(--primary)/0.15)]">
              <div className="bg-card rounded-[2.5rem] overflow-hidden">
                <div className="bg-primary/10 px-6 py-4 flex items-center gap-3 border-b border-border/40">
                  <img src={avatarAura} alt="Aura" className="w-10 h-10 rounded-full object-cover" />
                  <div className="flex-1">
                    <p className="font-semibold text-foreground text-sm">Aura</p>
                    <p className="text-xs text-muted-foreground">
                      {isTyping ? (
                        <span className="text-primary animate-pulse">digitando...</span>
                      ) : (
                        "online agora"
                      )}
                    </p>
                  </div>
                  <Smartphone className="w-5 h-5 text-muted-foreground" />
                </div>

                <div
                  ref={messagesContainerRef}
                  className="bg-background/60 p-4 h-[420px] overflow-y-auto scroll-smooth"
                >
                  <div className="space-y-1">
                    {messages.slice(0, visibleMessages).map((message, index) => {
                      const partOfSequence = isPartOfSequence(index);
                      const lastInSequence = isLastInSequence(index);

                      return (
                        <div
                          key={index}
                          className={`flex ${
                            message.sender === "user" ? "justify-end" : "justify-start"
                          } animate-message-in ${!partOfSequence ? "mt-3" : ""}`}
                          style={{ animationDelay: `${index * 0.02}s` }}
                        >
                          {message.isAudioOnly ? (
                            <div className="bg-card border border-border/60 rounded-3xl rounded-bl-sm px-3 py-2 max-w-[85%]">
                              <WhatsAppVoiceMessage
                                isPlaying={isAudioPlaying}
                                onToggle={handleAudioToggle}
                                duration="0:04"
                                currentTime={0}
                                totalDuration={4}
                              />
                              {message.time && (
                                <p className="text-[10px] mt-1 text-muted-foreground text-right">
                                  {message.time}
                                </p>
                              )}
                            </div>
                          ) : (
                            <div
                              className={`max-w-[85%] rounded-3xl px-4 py-2.5 ${
                                message.sender === "user"
                                  ? "bg-secondary text-secondary-foreground rounded-br-md"
                                  : `bg-card border border-border/60 text-card-foreground ${
                                      partOfSequence ? "rounded-bl-sm" : "rounded-bl-md"
                                    }`
                              }`}
                            >
                              <p className="text-sm leading-relaxed">{message.content}</p>
                              {message.time && lastInSequence && (
                                <p
                                  className={`text-[10px] mt-1 ${
                                    message.sender === "user"
                                      ? "text-secondary-foreground/70"
                                      : "text-muted-foreground"
                                  }`}
                                >
                                  {message.time}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {isTyping && (
                    <div className="mt-3">
                      <TypingIndicator />
                    </div>
                  )}
                </div>

                <div className="bg-card px-4 py-3 border-t border-border/40">
                  {showStartButton ? (
                    <Button onClick={handleStartConversation} variant="sage" className="w-full">
                      <Play className="w-4 h-4 mr-2" />
                      Ver conversa completa
                    </Button>
                  ) : showRestartButton ? (
                    <Button
                      onClick={handleRestart}
                      variant="ghost"
                      className="w-full text-muted-foreground"
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Ver novamente
                    </Button>
                  ) : (
                    <div className="bg-muted rounded-full px-4 py-2 flex items-center gap-2">
                      <span className="text-sm text-muted-foreground flex-1">
                        Digite uma mensagem...
                      </span>
                      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                        <svg
                          className="w-4 h-4 text-primary-foreground"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                          />
                        </svg>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="absolute inset-0 -z-10 bg-primary/15 rounded-[3rem] blur-3xl opacity-60 scale-110" />
          </div>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-10 max-w-lg mx-auto">
          A Aura não dá respostas prontas. Ela te ajuda a encontrar as suas — com perguntas certeiras e apoio genuíno.
        </p>

        {isComplete && (
          <div className="text-center mt-10 animate-fade-up">
            <p className="font-display text-xl md:text-2xl font-medium text-foreground mb-5">
              Pronto pra descobrir suas pistas?
            </p>
            <Link
              to={checkoutHref("demo", "v3")}
              onClick={() => trackLandingCta("demo", "Começar minha jornada (demo v3)", "v3")}
            >
              <Button variant="sage" size="xl">
                Começar minha jornada
              </Button>
            </Link>
            <p className="text-sm text-muted-foreground mt-3">
              7 dias por R$ 6,90 • Cancele quando quiser
            </p>
          </div>
        )}
      </div>
    </section>
  );
};

export default DemoV3;
