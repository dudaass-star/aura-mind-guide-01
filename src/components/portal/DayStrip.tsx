import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";

// Fileira de dias para tocar, no lugar do calendário do navegador. Datas em "AAAA-MM-DD" (BRT).
const TZ = "America/Sao_Paulo";
const brtToday = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00-03:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

export function DayStrip({ min, max, value, onChange }: { min: string; max: string; value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const days = useMemo(() => {
    const out: string[] = [];
    for (let d = min; d <= max && out.length < 62; d = addDays(d, 1)) out.push(d);
    return out;
  }, [min, max]);
  const today = brtToday();
  const tomorrow = addDays(today, 1);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [value]);

  return (
    <div ref={ref} role="radiogroup" aria-label="Dia" className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {days.map((d) => {
        const date = new Date(`${d}T12:00:00-03:00`);
        const top = d === today ? "Hoje" : d === tomorrow ? "Amanhã" : date.toLocaleDateString("pt-BR", { weekday: "short", timeZone: TZ }).replace(".", "");
        const month = date.toLocaleDateString("pt-BR", { month: "short", timeZone: TZ }).replace(".", "");
        const selected = d === value;
        return (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={date.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: TZ })}
            onClick={() => onChange(d)}
            className={cn(
              "flex w-[4.25rem] shrink-0 snap-center flex-col items-center rounded-2xl py-2.5 transition-colors",
              selected ? "bg-primary text-primary-foreground shadow-md" : "bg-foreground/5 text-foreground hover:bg-foreground/10",
            )}
          >
            <span className={cn("text-[11px] font-semibold capitalize", !selected && "text-muted-foreground")}>{top}</span>
            <span className="font-display text-xl font-semibold leading-tight">{date.getUTCDate()}</span>
            <span className={cn("text-[10px] capitalize", !selected && "text-muted-foreground")}>{month}</span>
          </button>
        );
      })}
    </div>
  );
}
