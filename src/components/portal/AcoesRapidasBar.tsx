import { Calendar, RefreshCw, Bell } from "lucide-react";
import { auraWhatsAppLink } from "./whatsapp";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const REAGENDAR_OPTIONS = [
  { days: 7, label: "Daqui a 7 dias" },
  { days: 14, label: "Daqui a 14 dias" },
  { days: 30, label: "Daqui a 30 dias" },
];

const chipClass =
  "shrink-0 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium font-['Nunito'] text-foreground/80 hover:border-accent/60 hover:text-accent hover:bg-accent/5 transition-all";

export function AcoesRapidasBar({ hasNextSession = false }: { hasNextSession?: boolean }) {
  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1 pb-1 animate-fade-in">
      <a
        href={auraWhatsAppLink("Oi Aura, quero marcar uma sessão.")}
        target="_blank"
        rel="noopener noreferrer"
        className={chipClass}
      >
        <Calendar size={13} />
        <span>Marcar sessão</span>
      </a>

      {hasNextSession && (
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className={chipClass}>
              <RefreshCw size={13} />
              <span>Reagendar</span>
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 p-2">
            <p className="px-2 pt-1 pb-2 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold font-['Nunito']">
              Adiar próxima sessão
            </p>
            <div className="flex flex-col gap-1">
              {REAGENDAR_OPTIONS.map((opt) => (
                <a
                  key={opt.days}
                  href={auraWhatsAppLink(
                    `Oi Aura, quero remarcar minha próxima sessão para daqui a ${opt.days} dias.`,
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md px-2 py-2 text-sm font-['Nunito'] text-foreground/90 hover:bg-accent/10 hover:text-accent transition-colors"
                >
                  {opt.label}
                </a>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}

      <a
        href={auraWhatsAppLink("Oi Aura, me manda mensagem amanhã de manhã?")}
        target="_blank"
        rel="noopener noreferrer"
        className={chipClass}
      >
        <Bell size={13} />
        <span>Me chama amanhã</span>
      </a>
    </div>
  );
}