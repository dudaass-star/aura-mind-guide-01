import { Smartphone } from "lucide-react";

const messages = [
  {
    sender: "user",
    content: "To muito ansiosa com uma apresentação importante amanhã. Não consigo parar de pensar no que pode dar errado.",
    time: "22:47",
  },
  {
    sender: "aura",
    content: "Eu entendo essa ansiedade... apresentações importantes mexem muito com a gente. Me conta: o que especificamente você imagina que pode dar errado?",
    time: "22:47",
  },
  {
    sender: "user",
    content: "Tenho medo de travar, de esquecer tudo que preparei",
    time: "22:48",
  },
  {
    sender: "aura",
    content: "Esse medo de travar é muito comum, e faz sentido você sentir isso. Deixa eu te perguntar: nas últimas vezes que você apresentou algo, o que realmente aconteceu? Você travou ou conseguiu seguir?",
    time: "22:48",
  },
  {
    sender: "user",
    content: "Na verdade... eu sempre dei um jeito de continuar",
    time: "22:49",
  },
  {
    sender: "aura",
    content: "Então você já tem evidências de que consegue lidar com isso, né? Seu corpo pode ficar nervoso, mas você sabe se adaptar. Que tal a gente criar um pequeno \"plano de emergência\" pra amanhã, só pra sua mente ficar mais tranquila?",
    time: "22:49",
  },
];

const Demo = () => {
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
            Conversas reais, perguntas que fazem você pensar, direção prática.
          </p>
        </div>

        {/* Phone mockup */}
        <div className="max-w-md mx-auto">
          <div className="relative">
            {/* Phone frame */}
            <div className="bg-foreground/90 rounded-[3rem] p-3 shadow-2xl">
              <div className="bg-card rounded-[2.5rem] overflow-hidden">
                {/* Phone header */}
                <div className="bg-primary/10 px-6 py-4 flex items-center gap-3 border-b border-border/30">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <span className="text-primary font-display font-bold text-lg">A</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-foreground text-sm">AURA</p>
                    <p className="text-xs text-muted-foreground">online agora</p>
                  </div>
                  <Smartphone className="w-5 h-5 text-muted-foreground" />
                </div>
                
                {/* Messages */}
                <div className="bg-background/50 p-4 space-y-3 max-h-[500px] overflow-y-auto">
                  {messages.map((message, index) => (
                    <div
                      key={index}
                      className={`flex ${message.sender === "user" ? "justify-end" : "justify-start"}`}
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
                      </div>
                    </div>
                  ))}
                </div>

                {/* Input bar */}
                <div className="bg-card px-4 py-3 border-t border-border/30">
                  <div className="bg-muted rounded-full px-4 py-2 flex items-center gap-2">
                    <span className="text-sm text-muted-foreground flex-1">Digite uma mensagem...</span>
                    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                      <svg className="w-4 h-4 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Glow effect */}
            <div className="absolute inset-0 -z-10 bg-primary/20 rounded-[3rem] blur-3xl opacity-50 scale-110" />
          </div>
        </div>

        {/* Caption */}
        <p className="text-center text-sm text-muted-foreground mt-8 max-w-lg mx-auto">
          A AURA não dá respostas prontas. Ela te ajuda a encontrar as suas — 
          com perguntas certeiras e apoio genuíno.
        </p>

        {/* CTA */}
        <div className="text-center mt-10">
          <p className="font-display text-xl font-bold text-foreground mb-4">
            Quer sentir isso na prática?
          </p>
          <a href="/experimentar">
            <button className="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-12 rounded-xl px-8 text-base">
              Começar Conversa
            </button>
          </a>
          <p className="text-sm text-muted-foreground mt-2">
            Sua primeira conversa em menos de 2 minutos
          </p>
        </div>
      </div>
    </section>
  );
};

export default Demo;
