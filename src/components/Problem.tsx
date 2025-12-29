const Problem = () => {
  return (
    <section className="py-20 bg-lavender-soft/30 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-1/3 h-full bg-blush-soft/40 rounded-r-[100px] opacity-60" />
      
      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-6">
            O pior momento não é na sessão.{" "}
            <span className="text-gradient-lavender">É entre elas.</span>
          </h2>
          
          <p className="font-body text-lg md:text-xl text-muted-foreground leading-relaxed">
            A cabeça aperta num dia aleatório e você precisa de clareza na hora, não daqui a 7 dias.
            <br className="hidden md:block" />
            <span className="text-foreground font-medium">
              A AURA fica no seu WhatsApp pra te puxar de volta pro eixo com direção prática e consistência.
            </span>
          </p>
        </div>
      </div>
    </section>
  );
};

export default Problem;