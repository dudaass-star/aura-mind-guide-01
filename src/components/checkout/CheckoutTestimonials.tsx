import { Star } from "lucide-react";
import avatarMariana from "@/assets/avatar-mariana.jpg";
import avatarCarlos from "@/assets/avatar-carlos.jpg";
import avatarJuliana from "@/assets/avatar-juliana.jpg";
import avatarPedro from "@/assets/avatar-pedro.jpg";
import avatarFernanda from "@/assets/avatar-fernanda.jpg";
import "@/styles/v5-hero.css";

// Mesmos depoimentos e visual (faixa sálvia + cartões pérola) do Quiz,
// para quem chega ao checkout sem ter passado pela prova social da página.
const ITEMS = [
  { h: "Parei de me colocar sempre por último.", q: "Percebi que eu sempre engolia o que sentia para não criar atrito. O primeiro encontro já me deu uma clareza que eu não tinha há anos.", n: "Mariana S., 34 anos", m: "Membro há 4 meses", a: avatarMariana },
  { h: "Voltei a dormir sem remoer o dia na cabeça.", q: "Eu deitava exausto, mas a mente não desligava pensando em trabalho e pendências. A AURA me ajudou a organizar o que realmente importava.", n: "Carlos R., 32 anos", m: "Membro há 3 meses", a: avatarCarlos },
  { h: "As perguntas certas que eu fugia de me fazer.", q: "Achei que seria superficial, mas ela vai direto na raiz sem rodeios. Não passa a mão na cabeça, mas acolhe de verdade.", n: "Juliana M., 41 anos", m: "Membro há 5 meses", a: avatarJuliana },
  { h: "Um espaço seguro, sem medo de julgamento.", q: "Sempre tive dificuldade de desabafar e parecer frágil. Poder falar abertamente a qualquer momento mudou o meu ritmo.", n: "Pedro H., 38 anos", m: "Membro há 2 meses", a: avatarPedro },
  { h: "Presença às 2h da manhã, quando a angústia batia.", q: "Não precisar agendar e ter alguém ali no momento exato em que a mente aperta não tem preço.", n: "Fernanda L., 29 anos", m: "Membro há 6 meses", a: avatarFernanda },
];

export function CheckoutTestimonials({ className = "" }: { className?: string }) {
  return (
    <div className={`theme-v5-night ${className}`}>
      <section aria-label="Quem já começou" className="quiz-voices -mx-4 rounded-none py-6 sm:mx-0 sm:rounded-2xl">
        <div className="flex items-end justify-between px-5">
          <p className="quiz-voices-kicker text-xs font-semibold uppercase tracking-[0.18em]">Quem já começou</p>
          <p className="quiz-voices-hint text-xs">Deslize →</p>
        </div>
        <div className="mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-3 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {ITEMS.map((t) => (
            <figure key={t.n} className="quiz-voice-card flex w-[85%] max-w-[340px] shrink-0 snap-center flex-col rounded-2xl px-4 py-4">
              <div className="flex">{[...Array(5)].map((_, i) => <Star key={i} className="quiz-voice-star h-3.5 w-3.5" />)}</div>
              <p className="quiz-voice-head mt-2 text-base font-semibold leading-snug">{t.h}</p>
              <blockquote className="quiz-voice-quote mt-1.5 flex-1 text-[15px] leading-relaxed">“{t.q}”</blockquote>
              <figcaption className="quiz-voice-meta mt-4 flex items-center gap-3 text-xs">
                <img src={t.a} alt={t.n} loading="lazy" className="quiz-voice-avatar h-10 w-10 rounded-full object-cover" />
                <span><span className="quiz-voice-name block text-sm font-semibold">{t.n}</span>{t.m}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>
    </div>
  );
}
