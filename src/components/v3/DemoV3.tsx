import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Smartphone, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackLandingCta, checkoutHref } from "@/lib/landing-analytics";
import avatarAura from "@/assets/avatar-aura.jpg";

interface Message {
  sender: "user" | "aura";
  content: string;
  time?: string;
  isFirstInSequence?: boolean;
}

const messages: Message[] = [
  {
    sender: "user",
    content: "Eu sei que essa relação me faz mal. Mas é só ele sumir que eu sinto falta e acabo voltando.",
    time: "21:32",
    isFirstInSequence: true,
  },
  { sender: "aura", content: "Posso te fazer uma pergunta meio difícil?", isFirstInSequence: true },
  { sender: "aura", content: "Quando ele volta, o que você sente primeiro? Que é amada... ou o alívio de não ter sido deixada?", time: "21:32" },
  { sender: "user", content: "Alívio. Porque por alguns dias eu acho que agora vai ser diferente.", time: "21:33", isFirstInSequence: true },
  { sender: "aura", content: "Então olha o que parece estar acontecendo...", isFirstInSequence: true },
  { sender: "aura", content: "Talvez você não esteja voltando pra relação que vocês têm." },
  { sender: "aura", content: "Talvez esteja voltando pra esperança da relação que queria que vocês tivessem." },
  { sender: "aura", content: "E por alguns dias esse alívio parece amor. Até você começar a se perder de novo." },
  { sender: "aura", content: "Se você parasse de tentar fazer essa história dar certo... o que já saberia que precisa fazer?", time: "21:33" },
  { sender: "user", content: "Que eu preciso parar de voltar.", time: "21:34", isFirstInSequence: true },
  { sender: "aura", content: "É. Então talvez não esteja faltando clareza.", isFirstInSequence: true },
  { sender: "aura", content: "O difícil é sustentar o que você já sabe quando a saudade vier tentar te convencer do contrário.", time: "21:34" },
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

const DemoV3 = () => {
  const initialVisibleMessages = 3;
  const [isPlaying, setIsPlaying] = useState(false);
  const [visibleMessages, setVisibleMessages] = useState(initialVisibleMessages);
  const [isTyping, setIsTyping] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll quando novas mensagens aparecem
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
    if (length < 50) return Math.min(1300, 700 + length * 12);
    if (length < 100) return Math.min(1800, 900 + length * 10);
    return Math.min(2200, 1100 + length * 9);
  };

  const calculateReadingDelay = (content: string): number =>
    Math.min(1800, 850 + content.length * 8);

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
        const readingDelay = humanizeDelay(900);
        const typingDuration = calculateTypingDelay(nextMessage.content);
        typingTimeout = setTimeout(() => setIsTyping(true), readingDelay);
        messageTimeout = setTimeout(() => {
          setIsTyping(false);
          setVisibleMessages((prev) => prev + 1);
        }, readingDelay + typingDuration);
      } else {
        const bubbleDelay = humanizeDelay(calculateReadingDelay(nextMessage.content));
        messageTimeout = setTimeout(() => setVisibleMessages((prev) => prev + 1), bubbleDelay);
      }
    } else {
      const userDelay = humanizeDelay(1400);
      messageTimeout = setTimeout(() => setVisibleMessages((prev) => prev + 1), userDelay);
    }

    return () => {
      clearTimeout(typingTimeout);
      clearTimeout(messageTimeout);
    };
  }, [isPlaying, visibleMessages]);

  const handleStartConversation = () => {
    setIsPlaying(true);
    setVisibleMessages(initialVisibleMessages);
    setIsComplete(false);
  };

  const handleRestart = () => {
    setVisibleMessages(initialVisibleMessages);
    setIsPlaying(false);
    setIsTyping(false);
    setIsComplete(false);
  };

  const handleAdvanceConversation = () => {
    if (!isPlaying || visibleMessages >= messages.length) return;
    setIsTyping(false);
    setVisibleMessages((current) => Math.min(current + 1, messages.length));
  };

  const showStartButton = !isPlaying && visibleMessages === initialVisibleMessages && !isComplete;
  const showRestartButton = isComplete || (!isPlaying && visibleMessages > initialVisibleMessages);

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
            Veja como uma conversa deixa de ser só desabafo e começa a revelar direção.
          </p>
        </div>

        <div className="max-w-md mx-auto">
          <div className="relative">
            <div className="bg-foreground/90 rounded-[3rem] p-3 shadow-[0_0_60px_hsl(var(--primary)/0.15)]">
              <div className="bg-card rounded-[2.5rem] overflow-hidden">
                {/* Header do mockup */}
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

                {/* Mensagens */}
                <div
                  ref={messagesContainerRef}
                  onClick={handleAdvanceConversation}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleAdvanceConversation();
                    }
                  }}
                  role={isPlaying ? "button" : undefined}
                  tabIndex={isPlaying ? 0 : undefined}
                  aria-label={isPlaying ? "Avançar conversa" : undefined}
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

                {/* Barra inferior / CTA */}
                <div className="bg-card px-4 py-3 border-t border-border/40">
                  {showStartButton ? (
                    <Button onClick={handleStartConversation} variant="sage" className="w-full">
                      <Play className="w-4 h-4 mr-2" />
                      Ver o que a AURA percebeu
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

            {/* Glow externo cinematográfico */}
            <div className="absolute inset-0 -z-10 bg-primary/15 rounded-[3rem] blur-3xl opacity-60 scale-110" />
          </div>
        </div>

        {/* Caption */}
        <p className="text-center text-sm text-muted-foreground mt-10 max-w-lg mx-auto">
          A AURA não entrega uma resposta pronta. Ela faz a pergunta que muda o ângulo, percebe o padrão e ajuda você a enxergar o que já estava sentindo.
        </p>

        {isComplete && (
          <div className="text-center mt-10 animate-fade-up">
            <p className="font-display text-xl md:text-2xl font-medium text-foreground mb-5">
              Pronto para começar a enxergar seu percurso?
            </p>
            <Link
              to={checkoutHref("demo", "v3")}
              onClick={() => trackLandingCta("demo", "Começar minha jornada (demo v2, "v3")")}
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