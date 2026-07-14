import { Calendar, RefreshCw, Pause, Bell } from "lucide-react";
import { auraWhatsAppLink } from "./whatsapp";

const ACOES = [
  {
    icon: Calendar,
    label: "Marcar sessão",
    message: "Oi Aura, quero marcar uma sessão.",
  },
  {
    icon: RefreshCw,
    label: "Reagendar",
    message: "Oi Aura, preciso reagendar minha sessão.",
  },
  {
    icon: Pause,
    label: "Pausar 7 dias",
    message: "Oi Aura, quero pausar as sessões por uma semana.",
  },
  {
    icon: Bell,
    label: "Me chama amanhã",
    message: "Oi Aura, me manda mensagem amanhã de manhã?",
  },
];

export function AcoesRapidasBar() {
  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1 pb-1 animate-fade-in">
      {ACOES.map((acao) => {
        const Icon = acao.icon;
        return (
          <a
            key={acao.label}
            href={auraWhatsAppLink(acao.message)}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium font-['Nunito'] text-foreground/80 hover:border-accent/60 hover:text-accent hover:bg-accent/5 transition-all"
          >
            <Icon size={13} />
            <span>{acao.label}</span>
          </a>
        );
      })}
    </div>
  );
}