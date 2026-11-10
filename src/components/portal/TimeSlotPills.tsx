import { Moon, Sun, Sunrise, Sunset } from "lucide-react";
import { cn } from "@/lib/utils";

// Horários em pílulas agrupadas por turno; substitui a lista nativa do sistema.
const GROUPS = [
  { label: "Madrugada", Icon: Moon, from: 0, to: 6 },
  { label: "Manhã", Icon: Sunrise, from: 6, to: 12 },
  { label: "Tarde", Icon: Sun, from: 12, to: 18 },
  { label: "Noite", Icon: Sunset, from: 18, to: 24 },
];

type Props = { times: string[]; value: string; onChange: (value: string) => void; label?: string };

export function TimeSlotPills({ times, value, onChange, label = "Horário" }: Props) {
  const groups = GROUPS.map((g) => ({ ...g, slots: times.filter((t) => { const h = Number(t.slice(0, 2)); return h >= g.from && h < g.to; }) })).filter((g) => g.slots.length);
  return (
    <div role="radiogroup" aria-label={label} className="max-h-64 space-y-3 overflow-y-auto pr-1">
      {groups.map(({ label: name, Icon, slots }) => (
        <div key={name}>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Icon className="h-3.5 w-3.5" aria-hidden />{name}</p>
          <div className="grid grid-cols-4 gap-2">
            {slots.map((slot) => {
              const active = slot === value;
              return (
                <button key={slot} type="button" role="radio" aria-checked={active} onClick={() => onChange(slot)}
                  className={cn("min-h-11 rounded-full border text-sm font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border bg-background text-foreground hover:border-primary/50 hover:bg-primary/5")}>
                  {slot}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
