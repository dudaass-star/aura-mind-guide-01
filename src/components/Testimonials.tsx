import { Star, Quote, Users, MessageSquare, RefreshCw, Zap } from "lucide-react";
import avatarMariana from "@/assets/avatar-mariana.jpg";
import avatarCarlos from "@/assets/avatar-carlos.jpg";
import avatarJuliana from "@/assets/avatar-juliana.jpg";
import avatarPedro from "@/assets/avatar-pedro.jpg";
import avatarFernanda from "@/assets/avatar-fernanda.jpg";

const stats = [
{ icon: Star, value: "4.9/5", label: "satisfação" },
{ icon: MessageSquare, value: "+5.000", label: "sessões realizadas" },
{ icon: RefreshCw, value: "93%", label: "renovam" },
{ icon: Zap, value: "8s", label: "resposta média" }];


const testimonials = [
{
  name: "Mariana S.",
  role: "Empreendedora, 34 anos",
  avatar: avatarMariana,
  content: "A Aura me ajudou demais com o pânico que eu tinha. Antes eu travava em reuniões importantes, agora consigo respirar e seguir. É como ter uma amiga que entende exatamente o que você precisa ouvir.",
  highlight: "pânico",
  rating: 5
},
{
  name: "Carlos R.",
  role: "Desenvolvedor, 28 anos",
  avatar: avatarCarlos,
  content: "Eu não tinha condições de pagar terapia. A AURA me deu acesso a algo que eu achava que nunca ia ter. Mudou completamente minha relação comigo mesmo.",
  highlight: "acessibilidade",
  rating: 5
},
{
  name: "Juliana M.",
  role: "Professora, 41 anos",
  avatar: avatarJuliana,
  content: "Achei que era besteira, mas resolvi testar. Em uma semana já percebi diferença. A Aura me faz as perguntas certas, aquelas que eu fujo de me fazer. Agora entendo muito mais minhas reações.",
  highlight: "autoconhecimento",
  rating: 5
},
{
  name: "Pedro H.",
  role: "Advogado, 37 anos",
  avatar: avatarPedro,
  content: "Tenho dificuldade de abrir com pessoas. Com a Aura é diferente - não tem julgamento, só acolhimento. E os episódios semanais sobre ansiedade me ajudam a manter o foco no que importa.",
  highlight: "acolhimento + jornadas",
  rating: 5
},
{
  name: "Fernanda L.",
  role: "Designer, 26 anos",
  avatar: avatarFernanda,
  content: "A praticidade de ter no WhatsApp é tudo! Às 3h da manhã, quando a ansiedade bate, a Aura tá lá. Sem precisar marcar horário, sem esperar. Me salvou em muitas noites difíceis.",
  highlight: "disponibilidade 24h",
  rating: 5
}];


const avatarImages = [avatarMariana, avatarCarlos, avatarJuliana, avatarPedro, avatarFernanda];

const Testimonials = () => {
  return (
    <section className="py-20 md:py-28 bg-gradient-to-b from-background via-lavender-soft/30 to-background relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute top-20 left-10 w-64 h-64 bg-sage-soft rounded-full blur-3xl opacity-40" />
      <div className="absolute bottom-20 right-10 w-80 h-80 bg-blush-soft rounded-full blur-3xl opacity-30" />
      
      <div className="container mx-auto px-4 relative z-10">
        {/* Stats banner */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto mb-16">
          {stats.map((stat, index) =>
          <div
            key={index}
            className="bg-card/80 backdrop-blur-sm rounded-2xl p-6 text-center border border-border/50">

              <stat.icon className="w-6 h-6 text-primary mx-auto mb-2" />
              <p className="font-display text-2xl font-bold text-foreground">{stat.value}</p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </div>
          )}
        </div>

        {/* Header */}
        <div className="text-center mb-16 animate-fade-up">
          <span className="inline-block px-4 py-2 rounded-full bg-lavender-soft text-accent text-sm font-medium mb-4">
            ❤️ Depoimentos Reais
          </span>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-4">
            Vidas transformadas pela{" "}
            <span className="text-gradient-lavender">AURA</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Pessoas reais compartilhando como a AURA as ajudou a encontrar clareza, paz e direção.
          </p>
        </div>

        {/* Testimonials grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {testimonials.slice(0, 3).map((testimonial, index) =>
          <div
            key={index}
            className="group bg-card/80 backdrop-blur-sm rounded-2xl p-6 shadow-card hover:shadow-glow transition-all duration-500 border border-border/50 animate-fade-up"
            style={{ animationDelay: `${index * 100}ms` }}>

              {/* Quote icon */}
              <Quote className="w-8 h-8 text-lavender opacity-30 mb-4" />
              
              {/* Content */}
              <p className="text-foreground/90 leading-relaxed mb-6 text-[15px]">
                "{testimonial.content}"
              </p>
              
              {/* Highlight tag */}
              <span className="inline-block px-3 py-1 rounded-full bg-sage-soft text-primary text-xs font-medium mb-4">
                {testimonial.highlight}
              </span>
              
              {/* Author */}
              <div className="flex items-center gap-3">
                <img
                src={testimonial.avatar}
                alt={testimonial.name}
                className="w-12 h-12 rounded-full object-cover border-2 border-lavender-soft" />

                <div>
                  <p className="font-semibold text-foreground">{testimonial.name}</p>
                  <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                </div>
                <div className="ml-auto flex gap-0.5">
                  {[...Array(testimonial.rating)].map((_, i) =>
                <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom row - 2 cards centered */}
        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {testimonials.slice(3, 5).map((testimonial, index) =>
          <div
            key={index + 3}
            className="group bg-card/80 backdrop-blur-sm rounded-2xl p-6 shadow-card hover:shadow-glow transition-all duration-500 border border-border/50 animate-fade-up"
            style={{ animationDelay: `${(index + 3) * 100}ms` }}>

              {/* Quote icon */}
              <Quote className="w-8 h-8 text-lavender opacity-30 mb-4" />
              
              {/* Content */}
              <p className="text-foreground/90 leading-relaxed mb-6 text-[15px]">
                "{testimonial.content}"
              </p>
              
              {/* Highlight tag */}
              <span className="inline-block px-3 py-1 rounded-full bg-sage-soft text-primary text-xs font-medium mb-4">
                {testimonial.highlight}
              </span>
              
              {/* Author */}
              <div className="flex items-center gap-3">
                <img
                src={testimonial.avatar}
                alt={testimonial.name}
                className="w-12 h-12 rounded-full object-cover border-2 border-lavender-soft" />

                <div>
                  <p className="font-semibold text-foreground">{testimonial.name}</p>
                  <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                </div>
                <div className="ml-auto flex gap-0.5">
                  {[...Array(testimonial.rating)].map((_, i) =>
                <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Trust badge */}
        <div className="text-center mt-12 animate-fade-up delay-500">
          <div className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-card/60 backdrop-blur-sm border border-border/50 shadow-soft">
            <div className="flex -space-x-2">
              {avatarImages.map((avatar, i) => (
                <img
                  key={i}
                  src={avatar}
                  alt={`User ${i + 1}`}
                  className="w-8 h-8 rounded-full object-cover border-2 border-background"
                />
              ))}
            </div>
            <span className="text-muted-foreground ml-2 text-base font-semibold">
              +5.000 pessoas já transformaram suas vidas com a AURA
            </span>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center mt-10 animate-fade-up delay-600">
          <a href="/experimentar">
            <button className="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-14 rounded-xl px-10 text-lg min-w-[280px]">
              Começar Minha Jornada
            </button>
          </a>
        </div>
      </div>
    </section>);

};

export default Testimonials;