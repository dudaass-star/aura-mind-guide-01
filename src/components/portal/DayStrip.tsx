import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// Mini calendário em grade mensal (D S T Q Q S S), no lugar do calendário do navegador. Datas em "AAAA-MM-DD" (BRT).
const TZ = "America/Sao_Paulo";
const brtToday = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });
const WEEK = ["D", "S", "T", "Q", "Q", "S", "S"];

function monthKey(iso: string) { return iso.slice(0, 7); }
function shiftMonth(key: string, n: number) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function DayStrip({ min, max, value, onChange }: { min: string; max: string; value: string; onChange: (v: string) => void }) {
  const [view, setView] = useState(() => monthKey(value || min));
  const today = brtToday();
  const cells = useMemo(() => {
    const [y, m] = view.split("-").map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const total = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const out: (string | null)[] = Array(first).fill(null);
    for (let d = 1; d <= total; d++) out.push(`${view}-${String(d).padStart(2, "0")}`);
    return out;
  }, [view]);
  const label = new Date(`${view}-15T12:00:00-03:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: TZ });
  const canPrev = view > monthKey(min);
  const canNext = view < monthKey(max);

  return (
    <div className="rounded-2xl bg-foreground/5 p-3">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => setView(shiftMonth(view, -1))} disabled={!canPrev} aria-label="Mês anterior" className="flex h-8 w-8 items-center justify-center rounded-full text-foreground hover:bg-foreground/10 disabled:opacity-25"><ChevronLeft className="h-4 w-4" /></button>
        <span className="font-display text-sm font-semibold capitalize">{label}</span>
        <button type="button" onClick={() => setView(shiftMonth(view, 1))} disabled={!canNext} aria-label="Próximo mês" className="flex h-8 w-8 items-center justify-center rounded-full text-foreground hover:bg-foreground/10 disabled:opacity-25"><ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {WEEK.map((w, i) => <span key={i} className="pb-1 text-[11px] font-semibold text-muted-foreground">{w}</span>)}
        {cells.map((d, i) => {
          if (!d) return <span key={`e${i}`} />;
          const disabled = d < min || d > max;
          const selected = d === value;
          return (
            <button
              key={d}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              aria-label={new Date(`${d}T12:00:00-03:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: TZ })}
              onClick={() => onChange(d)}
              className={cn(
                "mx-auto flex h-8 w-8 items-center justify-center rounded-full text-sm transition-colors",
                selected ? "bg-primary font-semibold text-primary-foreground" : disabled ? "text-muted-foreground/40" : "text-foreground hover:bg-foreground/10",
                !selected && d === today && !disabled && "font-semibold ring-1 ring-primary/60",
              )}
            >
              {Number(d.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
