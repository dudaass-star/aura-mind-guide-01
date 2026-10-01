import { ArrowRight, HeartHandshake, Route, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import movementImage from "@/assets/movimento-ola-aura.jpg";

const signals = [
  { icon: HeartHandshake, label: "Compartilhe com verdade" },
  { icon: Route, label: "Acompanhe o impacto" },
  { icon: Users, label: "Faça parte de algo maior" },
];

export default function MovementV2() {
  return (
    <section className="border-y border-border bg-background py-20 sm:py-28">
      <div className="container mx-auto grid items-center gap-10 px-6 lg:grid-cols-[1.08fr_.92fr] lg:gap-16">
        <div className="order-2 lg:order-1">
          <p className="text-xs font-bold uppercase text-primary">Movimento Olá Aura</p>
          <h2 className="mt-4 max-w-2xl font-display text-4xl font-semibold leading-tight sm:text-5xl">Compreender a si mesmo não deveria ser privilégio de poucos.</h2>
          <p className="mt-5 max-w-xl leading-relaxed text-muted-foreground">Uma comunidade de pessoas que acredita que apoio, compreensão e direção precisam chegar a mais gente — sem pressão, sem competição e sem transformar cuidado em venda.</p>
          <div className="mt-7 space-y-3">{signals.map(({ icon: Icon, label }) => <div key={label} className="flex items-center gap-3 text-sm font-semibold"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-primary"><Icon className="h-4 w-4" /></span>{label}</div>)}</div>
          <Button asChild size="lg" className="mt-8"><Link to="/movimento">Conhecer o Movimento <ArrowRight /></Link></Button>
        </div>
        <div className="order-1 overflow-hidden rounded-lg lg:order-2"><img src={movementImage} alt="Pessoas reunidas pelo Movimento Olá Aura" className="aspect-[4/3] h-full w-full object-cover" loading="lazy" /></div>
      </div>
    </section>
  );
}
