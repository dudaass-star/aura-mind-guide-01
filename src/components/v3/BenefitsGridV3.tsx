import {
  Clock, Brain, CalendarCheck, FileText, Heart, Pause,
  Cloud, Lightbulb, Bell, Headphones, MessageSquare, Sparkles,
} from "lucide-react";

const benefits = [
  { icon: Clock, title: "Nunca mais sozinho às 3h", desc: "Madrugada, domingo, feriado: a AURA responde quando a cabeça não para." },
  { icon: Brain, title: "Ela lembra da sua história", desc: "Você não precisa recomeçar do zero. Ela retoma de onde vocês pararam." },
  { icon: CalendarCheck, title: "45 minutos só pra você", desc: "Encontros guiados com método — não é papo aleatório de chatbot." },
  { icon: FileText, title: "Você sai com clareza no papel", desc: "Depois de cada encontro, recebe um resumo com o que ficou claro." },
  { icon: Heart, title: "Nunca te abandona", desc: "Se você sumir, a AURA vai atrás de você." },
  { icon: Pause, title: "Pausa quando precisar", desc: "Pause sua assinatura por até 30 dias." },
  { icon: Cloud, title: "Cápsula do Tempo", desc: "Grave uma mensagem para seu eu do futuro." },
  { icon: Lightbulb, title: "Insights que você não pediu", desc: "A AURA percebe padrões e te traz reflexões." },
  { icon: Bell, title: "Lembretes na hora certa", desc: "A AURA agenda e lembra do que importa pra você." },
  { icon: Headphones, title: "Meditações guiadas", desc: "A AURA percebe quando você precisa e envia." },
  { icon: MessageSquare, title: "Texto e áudio", desc: "Fale do jeito que for mais fácil pra você." },
  { icon: Sparkles, title: "Conteúdo no seu ritmo", desc: "Episódios sobre clareza, direção, foco e decisões." },
];

const BenefitsGridV3 = () => (
  <section className="relative py-24 md:py-32 v2-dark-section">
    <div className="container mx-auto px-6">
      <div className="text-center max-w-2xl mx-auto mb-14">
        <p className="text-xs uppercase tracking-[0.25em] text-white/65 mb-4">tudo isso</p>
        <h2 className="font-display text-3xl md:text-5xl font-medium leading-[1.15] tracking-tight text-white">
          A partir de <span className="italic">R$ 0,33</span> por dia.
        </h2>
        <p className="mt-5 text-base text-white/70">
          Apoio contínuo no WhatsApp para você parar de remoer e começar a agir.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-10 max-w-6xl mx-auto">
        {benefits.map((b) => (
          <div key={b.title} className="flex gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mt-0.5">
              <b.icon className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white mb-1">{b.title}</h3>
              <p className="text-xs text-white/70 leading-relaxed">{b.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default BenefitsGridV3;
