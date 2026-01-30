import { useState, useEffect, useRef } from "react";
import { Smartphone, Play, Pause, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import avatarAura from "@/assets/avatar-aura.jpg";

interface Message {
  sender: "user" | "aura";
  content: string;
  time: string;
  hasAudio?: boolean;
}

const messages: Message[] = [
  {
    sender: "user",
    content: "Tenho 28 anos e ainda não sei o que quero da vida. Todo mundo parece ter um caminho, menos eu.",
    time: "21:32",
  },
  {
    sender: "aura",
    content: "Esse peso de \"todo mundo parece saber\" é muito real... e muito injusto com você mesma. Me conta: quando você diz que não sabe o que quer, é sobre trabalho? Relacionamentos? Ou é algo mais fundo?",
    time: "21:32",
  },
  {
    sender: "user",
    content: "É tudo. Sinto que to só existindo, sabe? Não vivendo de verdade.",
    time: "21:33",
  },
  {
    sender: "aura",
    content: "\"Só existindo\"... isso diz muito. Deixa eu te perguntar uma coisa: teve algum momento recente, mesmo que pequeno, em que você sentiu que estava vivendo de verdade? Pode ser algo simples.",
    time: "21:33",
  },
  {
    sender: "user",
    content: "Semana passada eu passei a tarde toda desenhando. Nem vi o tempo passar.",
    time: "21:34",
  },
  {
    sender: "aura",
    content: "Olha só o que você acabou de me mostrar... Você diz que não sabe o que quer, mas seu corpo sabe. Ele te levou pra um lugar onde o tempo sumiu. Isso não é \"só existir\". Isso é uma pista enorme.",
    time: "21:34",
    hasAudio: true,
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

const AudioPlayer = ({ isPlaying, onToggle }: { isPlaying: boolean; onToggle: () => void }) => (
  <button
    onClick={onToggle}
    className="mt-2 flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors group"
  >
    {isPlaying ? (
      <Pause className="w-3.5 h-3.5 text-primary" />
    ) : (
      <Play className="w-3.5 h-3.5 text-primary" />
    )}
    
    {/* Waveform */}
    <div className="flex items-center gap-0.5 h-4">
      {[...Array(8)].map((_, i) => (
        <div
          key={i}
          className={`w-0.5 bg-primary rounded-full transition-all ${
            isPlaying ? "animate-waveform" : "h-1"
          }`}
          style={{
            animationDelay: `${i * 0.1}s`,
            height: isPlaying ? undefined : `${4 + Math.random() * 8}px`,
          }}
        />
      ))}
    </div>
    
    <span className="text-xs text-primary font-medium">
      {isPlaying ? "Pausar" : "Ouvir"}
    </span>
  </button>
);

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

  // Animation logic
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
    
    // Calculate delay based on message type and length
    const baseDelay = isAuraMessage ? 1500 : 800;
    const typingDuration = isAuraMessage ? Math.min(2500, 1000 + nextMessage.content.length * 8) : 0;

    let typingTimeout: NodeJS.Timeout;
    let messageTimeout: NodeJS.Timeout;

    if (isAuraMessage) {
      // Show typing indicator first
      typingTimeout = setTimeout(() => {
        setIsTyping(true);
      }, baseDelay);

      // Then show the message
      messageTimeout = setTimeout(() => {
        setIsTyping(false);
        setVisibleMessages((prev) => prev + 1);
      }, baseDelay + typingDuration);
    } else {
      // User messages appear after a shorter delay
      messageTimeout = setTimeout(() => {
        setVisibleMessages((prev) => prev + 1);
      }, baseDelay);
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
      audioRef.current = new Audio("/audio/aura-demo-voice.mp3");
      audioRef.current.onended = () => setIsAudioPlaying(false);
    }

    if (isAudioPlaying) {
      audioRef.current.pause();
      setIsAudioPlaying(false);
    } else {
      audioRef.current.play().catch(() => {
        // Audio file not available yet
        console.log("Audio file not available");
      });
      setIsAudioPlaying(true);
    }
  };

  const showStartButton = !isPlaying && visibleMessages === 1 && !isComplete;
  const showRestartButton = isComplete || (!isPlaying && visibleMessages > 1);

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
                  className="bg-background/50 p-4 space-y-3 h-[420px] overflow-y-auto scroll-smooth"
                >
                  {messages.slice(0, visibleMessages).map((message, index) => (
                    <div
                      key={index}
                      className={`flex ${message.sender === "user" ? "justify-end" : "justify-start"} animate-message-in`}
                      style={{ animationDelay: `${index * 0.05}s` }}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                          message.sender === "user"
                            ? "bg-primary text-primary-foreground rounded-br-md"
                            : "bg-card border border-border/50 text-foreground rounded-bl-md"
                        }`}
                      >
                        <p className="text-sm leading-relaxed">{message.content}</p>
                        <p className={`text-[10px] mt-1 ${
                          message.sender === "user" 
                            ? "text-primary-foreground/70" 
                            : "text-muted-foreground"
                        }`}>
                          {message.time}
                        </p>
                        
                        {/* Audio player for last AURA message */}
                        {message.hasAudio && isComplete && (
                          <AudioPlayer 
                            isPlaying={isAudioPlaying} 
                            onToggle={handleAudioToggle} 
                          />
                        )}
                      </div>
                    </div>
                  ))}
                  
                  {/* Typing indicator */}
                  {isTyping && <TypingIndicator />}
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
