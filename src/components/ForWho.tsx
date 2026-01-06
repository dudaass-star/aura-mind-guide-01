import { Brain, Heart, Route, CalendarCheck, Compass } from "lucide-react";
const profiles = [{
  icon: Brain,
  title: "Pensa demais",
  description: "Fica ruminando decisões, pensamentos em loop, dificuldade de desligar a mente.",
  color: "bg-sage-soft",
  iconColor: "text-primary"
}, {
  icon: Heart,
  title: "Guarda tudo para si",
  description: "Não consegue falar com ninguém, engole as emoções, sente que ninguém entende.",
  color: "bg-lavender-soft",
  iconColor: "text-accent"
}, {
  icon: Route,
  title: "Você que está em transição",
  description: "Mudança de emprego, término, luto, nova fase da vida que exige clareza.",
  color: "bg-blush-soft",
  iconColor: "text-blush"
}, {
  icon: CalendarCheck,
  title: "Você que quer consistência",
  description: "Já tentou várias coisas mas não consegue manter o hábito de cuidar de si.",
  color: "bg-sky-soft",
  iconColor: "text-sky"
}, {
  icon: Compass,
  title: "Precisa de direção",
  description: "Sabe que algo está errado mas não sabe por onde começar a mudar.",
  color: "bg-sage-soft",
  iconColor: "text-primary"
}];
const ForWho = () => {
  return <section className="py-24 bg-card relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-1/2 h-full bg-lavender-soft/20 rounded-l-[200px] opacity-50" />
      
      <div className="container mx-auto px-4 relative z-10">
        <div className="text-center mb-16">
          <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-4">
            A AURA foi criada pra{" "}
            <span className="text-gradient-lavender">você que...</span>
          </h2>
          
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {profiles.slice(0, 3).map((profile, index) => <div key={index} className="group p-8 rounded-3xl bg-background border border-border/50 hover:shadow-card hover:border-primary/20 transition-all duration-500">
              <div className={`w-16 h-16 rounded-2xl ${profile.color} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}>
                <profile.icon className={`w-8 h-8 ${profile.iconColor}`} />
              </div>
              <h3 className="font-display text-xl font-bold text-foreground mb-3">
                {profile.title}
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                {profile.description}
              </p>
            </div>)}
        </div>

        {/* Second row - 2 cards centered */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto mt-6">
          {profiles.slice(3, 5).map((profile, index) => <div key={index + 3} className="group p-8 rounded-3xl bg-background border border-border/50 hover:shadow-card hover:border-primary/20 transition-all duration-500">
              <div className={`w-16 h-16 rounded-2xl ${profile.color} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}>
                <profile.icon className={`w-8 h-8 ${profile.iconColor}`} />
              </div>
              <h3 className="font-display text-xl font-bold text-foreground mb-3">
                {profile.title}
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                {profile.description}
              </p>
            </div>)}
        </div>
      </div>
    </section>;
};
export default ForWho;