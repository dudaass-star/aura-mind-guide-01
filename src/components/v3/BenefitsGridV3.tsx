import {
  CalendarCheck, BookMarked, Route, Headphones,
  MessageCircleQuestion, Cloud, Lightbulb, MessageSquare,
} from "lucide-react";

const benefits = [
  { icon: CalendarCheck, title: "Encontros guiados de 45 minutos", desc: "Um espaço focado para investigar um tema, ganhar perspectiva e chegar a um fechamento que permanece." },
  { icon: BookMarked, title: "Seu percurso em capítulos", desc: "Mudanças, temas, marcos e trechos das suas próprias palavras formam um capítulo novo a cada mês." },
  { icon: Route, title: "Jornadas ligadas ao seu momento", desc: "Conteúdos que não chegam soltos: continuam o que apareceu nas suas conversas e acompanham seu ritmo." },
  { icon: Headphones, title: "Meditações e áudios para o contexto", desc: "Experiências em áudio escolhidas para o que você está vivendo, na mesma voz que já te acompanha." },
  { icon: MessageCircleQuestion, title: "Perguntas que abrem caminhos", desc: "Provocações relevantes ajudam a sair do piloto automático e iniciar conversas que importam." },
  { icon: Cloud, title: "Cápsula do tempo", desc: "Grave uma mensagem para o seu eu do futuro e perceba, com a própria voz, o que mudou." },
  { icon: Lightbulb, title: "Insights e próximos passos", desc: "Conexões importantes deixam de se perder e podem virar clareza, escolha e movimento na vida real." },
];

const BenefitsGridV3 = () => (
  <section className="relative py-24 md:py-32 v2-dark-section">
    <div className="container mx-auto px-6">
      <div className="text-center max-w-2xl mx-auto mb-14">
        <p className="text-xs uppercase tracking-[0.25em] text-white/65 mb-4">uma experiência que cresce com você</p>
        <h2 className="font-display text-3xl md:text-5xl font-medium leading-[1.15] tracking-tight text-white">
          A conversa passa. O que ela constrói
          <br className="hidden md:block" /> <span className="italic text-gradient-sage">fica com você.</span>
        </h2>
        <p className="mt-5 text-base text-white/70">
          A AURA transforma o que vocês vivem juntas em experiências que ajudam você a enxergar, registrar e sustentar mudanças.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-px max-w-5xl mx-auto border-y border-white/10">
        {benefits.map((b, index) => (
          <div key={b.title} className={`flex gap-4 py-7 md:px-8 ${index % 2 === 0 ? "md:border-r md:border-white/10" : ""}`}>
            <div className="flex-shrink-0 w-11 h-11 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mt-0.5">
              <b.icon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-display text-lg text-white mb-2">{b.title}</h3>
              <p className="text-sm text-white/70 leading-relaxed">{b.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-12 flex flex-wrap items-center justify-center gap-x-7 gap-y-3 text-xs text-white/65">
        <span className="inline-flex items-center gap-2"><MessageSquare className="w-4 h-4 text-primary" /> Texto e áudio</span>
        <span>App Olá Aura</span>
        <span>Disponível 24/7</span>
        <span>Continuidade entre conversas</span>
      </div>
    </div>
  </section>
);

export default BenefitsGridV3;
