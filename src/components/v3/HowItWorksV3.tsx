import { MessageCircle, Sparkles, CalendarHeart } from "lucide-react";

const steps = [
  {
    icon: MessageCircle,
    title: "Mande mensagem quando precisar",
    desc: "Texto ou áudio, a qualquer hora. A AURA responde em segundos.",
  },
  {
    icon: Sparkles,
    title: "Conversa com profundidade",
    desc: "A AURA faz as perguntas certas e te ajuda a organizar o que está embaralhado na sua cabeça.",
  },
  {
    icon: CalendarHeart,
    title: "Encontros guiados",
    desc: "45 minutos focados, com método, resumo escrito e retrospectiva do seu percurso.",
  },
];

const HowItWorksV3 = () => (
  <section id="como-funciona" className="relative py-24 md:py-32 bg-background">
    <div className="container mx-auto px-6">
      <div className="text-center max-w-2xl mx-auto mb-16">
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground mb-4">
          simples como mandar uma mensagem · profundo como uma conversa de verdade
        </p>
        <h2 className="font-display text-3xl md:text-5xl font-medium leading-[1.15] tracking-tight text-foreground">
          Como funciona a <span className="text-gradient-sage">AURA</span>
        </h2>
      </div>

      <div className="grid md:grid-cols-3 gap-10 max-w-5xl mx-auto">
        {steps.map((s, i) => (
          <div key={s.title} className="text-center">
            <div className="relative mx-auto w-16 h-16 rounded-full bg-[hsl(var(--sage-soft))] flex items-center justify-center mb-6">
              <s.icon className="w-7 h-7 text-primary" />
              <span className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-card border border-border flex items-center justify-center text-xs font-display text-foreground">
                {i + 1}
              </span>
            </div>
            <h3 className="font-display text-xl text-foreground mb-3">{s.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-[280px] mx-auto">
              {s.desc}
            </p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default HowItWorksV3;
