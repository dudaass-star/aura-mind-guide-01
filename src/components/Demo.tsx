import { useState, useEffect, useRef } from "react";
import { Smartphone, Play, Pause, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import avatarAura from "@/assets/avatar-aura.jpg";

interface Message {
  sender: "user" | "aura";
  content: string;
  time?: string;
  isAudioOnly?: boolean;
  isFirstInSequence?: boolean;
}

// Conversa com balões múltiplos - estilo humano
const messages: Message[] = [
  // Mensagem 1 - Usuária
  {
    sender: "user",
    content: "Tenho 28 anos e ainda não sei o que quero da vida. Todo mundo parece ter um caminho, menos eu.",
    time: "21:32",
    isFirstInSequence: true,
  },
  // Mensagens 2-4 - AURA (sequência)
  {
    sender: "aura",
    content: "Esse peso de \"todo mundo parece saber\" é muito real...",
    isFirstInSequence: true,
  },
  {
    sender: "aura",
    content: "...e muito injusto com você mesma",
  },
  {
    sender: "aura",
    content: "Me conta: quando você diz que não sabe o que quer, é sobre trabalho? Relacionamentos? Ou é algo mais fundo?",
    time: "21:32",
  },
  // Mensagem 5 - Usuária
  {
    sender: "user",
    content: "É tudo. Sinto que to só existindo, sabe? Não vivendo de verdade.",
    time: "21:33",
    isFirstInSequence: true,
  },
  // Mensagens 6-9 - AURA (sequência)
  {
    sender: "aura",
    content: "\"Só existindo\"...",
    isFirstInSequence: true,
  },
  {
    sender: "aura",
    content: "isso diz muito",
  },
  {
    sender: "aura",
    content: "Deixa eu te perguntar uma coisa: teve algum momento recente, mesmo que pequeno, em que você sentiu que estava vivendo de verdade?",
  },
  {
    sender: "aura",
    content: "Pode ser algo simples",
    time: "21:33",
  },
  // Mensagem 10 - Usuária
  {
    sender: "user",
    content: "Semana passada eu passei a tarde toda desenhando. Nem vi o tempo passar.",
    time: "21:34",
    isFirstInSequence: true,
  },
  // Mensagens 11-16 - AURA (sequência final)
  {
    sender: "aura",
    content: "Olha só o que você acabou de me mostrar...",
    isFirstInSequence: true,
  },
  {
    sender: "aura",
    content: "Você diz que não sabe o que quer",
  },
  {
    sender: "aura",
    content: "mas seu corpo sabe",
  },
  {
    sender: "aura",
    content: "Ele te levou pra um lugar onde o tempo sumiu",
  },
  {
    sender: "aura",
    content: "Isso não é \"só existir\"",
  },
  {
    sender: "aura",
    content: "Isso é uma pista enorme 💡",
  },
  {
    sender: "aura",
    content: "",
    time: "21:34",
    isAudioOnly: true,
  },
];

const TypingIndicator = () => (
  <div className="flex justify-start">
    <div className="bg-card border border-border/50 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1">
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
  totalDuration = 4
}: { 
  isPlaying: boolean; 
  onToggle: () => void;
  duration?: string;
  currentTime?: number;
  totalDuration?: number;
}) => {
  // Generate waveform bars with varying heights (WhatsApp style)
  const waveformBars = [
    4, 8, 5, 12, 6, 14, 8, 10, 5, 16, 12, 8, 14, 6, 10, 8, 12, 5, 14, 8,
    6, 10, 12, 8, 5, 14, 10, 6, 12, 8, 4, 10, 8, 6, 4
  ];
  
  const progress = (currentTime / totalDuration) * 100;

  return (
    <div className="flex items-center gap-2 mt-2 py-1">
      {/* Play/Pause button */}
      <button
        onClick={onToggle}
        className="w-10 h-10 rounded-full bg-primary flex items-center justify-center flex-shrink-0 hover:bg-primary/90 transition-colors"
      >
        {isPlaying ? (
          <Pause className="w-5 h-5 text-primary-foreground" fill="currentColor" />
        ) : (
          <Play className="w-5 h-5 text-primary-foreground ml-0.5" fill="currentColor" />
        )}
      </button>

      {/* Waveform container */}
      <div className="flex-1 flex flex-col gap-1">
        {/* Waveform bars */}
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
                style={{
                  height: `${height}px`,
                  animationDelay: `${i * 0.02}s`,
                }}
              />
            );
          })}
        </div>
        
        {/* Duration */}
        <span className="text-[10px] text-muted-foreground">
          {isPlaying ? `0:0${Math.floor(currentTime)}` : duration}
        </span>
      </div>

      {/* Avatar */}
      <img 
        src={avatarAura} 
        alt="AURA" 
        className="w-10 h-10 rounded-full object-cover flex-shrink-0 border-2 border-primary/20"
      />
    </div>
  );
};

const Demo = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [visibleMessages, setVisibleMessages] = useState(1);
  const [isTyping, setIsTyping] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Auto-scroll to bottom when new messages appear
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [visibleMessages, isTyping]);

  // Human-like delay calculation based on real AURA timing - doubled for contemplative rhythm
  const calculateTypingDelay = (content: string): number => {
    const length = content.length;
    if (length < 50) {
      return Math.min(4000, 2000 + length * 40); // 2-4s for short
    } else if (length < 100) {
      return Math.min(5500, 3000 + length * 25); // 3-5.5s for medium
    } else {
      return Math.min(6000, 4000 + length * 20); // 4-6s for long (capped)
    }
  };

  // Randomize delay by ±20% for human-like variation
  const humanizeDelay = (baseDelay: number): number => {
    return baseDelay * (0.8 + Math.random() * 0.4);
  };

  // Animation logic with human-like timing
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
    
    let typingTimeout: NodeJS.Timeout;
    let messageTimeout: NodeJS.Timeout;
    
    if (isAuraMessage) {
      if (isFirstInSequence) {
        // First message in AURA sequence: simulate "reading" then typing
        const readingDelay = humanizeDelay(3000); // 2.4-3.6s to "read" the user message
        const typingDuration = calculateTypingDelay(nextMessage.content);
        
        // Show typing indicator after "reading"
        typingTimeout = setTimeout(() => {
          setIsTyping(true);
        }, readingDelay);

        // Show message after typing duration
        messageTimeout = setTimeout(() => {
          setIsTyping(false);
          setVisibleMessages((prev) => prev + 1);
        }, readingDelay + typingDuration);
      } else {
        // Consecutive AURA bubbles: 1.2-1.8s with ±20% randomization
        const bubbleDelay = humanizeDelay(1500); // Base 1500ms → 1.2-1.8s
        messageTimeout = setTimeout(() => {
          setVisibleMessages((prev) => prev + 1);
        }, bubbleDelay);
      }
    } else {
      // User messages: longer pause to simulate natural conversation flow
      const userDelay = humanizeDelay(3000); // 2.4-3.6s
      messageTimeout = setTimeout(() => {
        setVisibleMessages((prev) => prev + 1);
      }, userDelay);
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
      audioRef.current = new Audio("https://uhyogifgmutfmbyhzzyo.supabase.co/storage/v1/object/public/meditations/demo/aura-voice.mp3");
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

  // Helper to determine if message is part of a sequence (for visual grouping)
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
    <section className="py-24 bg-gradient-to-b from-background via-sage-soft/30 to-background relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute top-20 right-10 w-64 h-64 bg-lavender-soft rounded-full blur-3xl opacity-40" />
      <div className="absolute bottom-20 left-10 w-80 h-80 bg-sage-soft rounded-full blur-3xl opacity-30" />
      
      <div className="container mx-auto px-4 relative z-10">
        <div className="text-center mb-12">
          <span className="inline-block px-4 py-2 rounded-full bg-sage-soft text-primary text-sm font-medium mb-4">
            💬 Veja na prática
          </span>
          <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-4">
            Como é conversar com a{" "}
            <span className="text-gradient-sage">AURA</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Uma conversa real que mostra como a AURA te ajuda a enxergar o que você não vê.
          </p>
        </div>

        {/* Phone mockup */}
        <div className="max-w-md mx-auto">
          <div className="relative">
            {/* Phone frame */}
            <div 
              className={`bg-foreground/90 rounded-[3rem] p-3 shadow-2xl transition-all duration-500 ${
                isPlaying ? "shadow-primary/20 shadow-glow" : ""
              }`}
            >
              <div className="bg-card rounded-[2.5rem] overflow-hidden">
                {/* Phone header */}
                <div className="bg-primary/10 px-6 py-4 flex items-center gap-3 border-b border-border/30">
                  <img 
                    src={avatarAura} 
                    alt="AURA" 
                    className="w-10 h-10 rounded-full object-cover"
                  />
                  <div className="flex-1">
                    <p className="font-semibold text-foreground text-sm">AURA</p>
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
                
                {/* Messages */}
                <div 
                  ref={messagesContainerRef}
                  className="bg-background/50 p-4 h-[420px] overflow-y-auto scroll-smooth"
                >
                  <div className="space-y-1">
                    {messages.slice(0, visibleMessages).map((message, index) => {
                      const partOfSequence = isPartOfSequence(index);
                      const lastInSequence = isLastInSequence(index);
                      
                      return (
                        <div
                          key={index}
                          className={`flex ${message.sender === "user" ? "justify-end" : "justify-start"} animate-message-in ${
                            !partOfSequence ? "mt-3" : ""
                          }`}
                          style={{ animationDelay: `${index * 0.02}s` }}
                        >
                          {message.isAudioOnly ? (
                            // Audio-only message (separate bubble)
                            <div className="bg-card border border-border/50 rounded-2xl rounded-bl-sm px-3 py-2 max-w-[85%]">
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
                            // Text message bubble
                            <div
                              className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                                message.sender === "user"
                                  ? `bg-primary text-primary-foreground ${
                                      partOfSequence ? "rounded-br-md" : "rounded-br-md"
                                    }`
                                  : `bg-card border border-border/50 text-foreground ${
                                      partOfSequence ? "rounded-bl-sm" : "rounded-bl-md"
                                    }`
                              }`}
                            >
                              <p className="text-sm leading-relaxed">{message.content}</p>
                              
                              {/* Time only on last message of sequence */}
                              {message.time && lastInSequence && (
                                <p className={`text-[10px] mt-1 ${
                                  message.sender === "user" 
                                    ? "text-primary-foreground/70" 
                                    : "text-muted-foreground"
                                }`}>
                                  {message.time}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* Typing indicator */}
                  {isTyping && <div className="mt-3"><TypingIndicator /></div>}
                </div>

                {/* Input bar / CTA */}
                <div className="bg-card px-4 py-3 border-t border-border/30">
                  {showStartButton ? (
                    <Button 
                      onClick={handleStartConversation}
                      variant="sage"
                      className="w-full"
                    >
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
                      <span className="text-sm text-muted-foreground flex-1">Digite uma mensagem...</span>
                      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                        <svg className="w-4 h-4 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Glow effect */}
            <div 
              className={`absolute inset-0 -z-10 bg-primary/20 rounded-[3rem] blur-3xl transition-all duration-500 ${
                isPlaying ? "opacity-70 scale-115 animate-pulse-soft" : "opacity-50 scale-110"
              }`} 
            />
          </div>
        </div>

        {/* Caption */}
        <p className="text-center text-sm text-muted-foreground mt-8 max-w-lg mx-auto">
          A AURA não dá respostas prontas. Ela te ajuda a encontrar as suas — 
          com perguntas certeiras e apoio genuíno.
        </p>

        {/* CTA */}
        {isComplete && (
          <div className="text-center mt-10 animate-fade-up">
            <p className="font-display text-xl font-bold text-foreground mb-4">
              Pronta pra descobrir suas pistas?
            </p>
            <a href="/experimentar">
              <Button variant="sage" size="xl">
                Começar minha jornada
              </Button>
            </a>
            <p className="text-sm text-muted-foreground mt-2">
              7 dias grátis • Cancele quando quiser
            </p>
          </div>
        )}
      </div>
    </section>
  );
};

export default Demo;
