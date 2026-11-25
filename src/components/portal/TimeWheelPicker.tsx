import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";

// Seletor de rolete (hora + minuto) com encaixe suave; recebe só horários válidos "HH:MM".
const ITEM = 40;

function Wheel({ items, value, onChange, ariaLabel }: { items: string[]; value: string; onChange: (v: string) => void; ariaLabel: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<number>();
  const idx = Math.max(0, items.indexOf(value));

  useEffect(() => {
    const el = ref.current;
    if (el && Math.abs(el.scrollTop - idx * ITEM) > 2) el.scrollTo({ top: idx * ITEM });
  }, [idx, items]);

  const onScroll = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const i = Math.min(items.length - 1, Math.max(0, Math.round(el.scrollTop / ITEM)));
      if (items[i] && items[i] !== value) onChange(items[i]);
    }, 90);
  };

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label={ariaLabel}
      onScroll={onScroll}
      className="relative h-[200px] w-20 snap-y snap-mandatory overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ maskImage: "linear-gradient(transparent, #000 30%, #000 70%, transparent)" }}
    >
      <div style={{ height: ITEM * 2 }} />
      {items.map((it) => (
        <button
          key={it}
          type="button"
          role="option"
          aria-selected={it === value}
          onClick={() => onChange(it)}
          className={cn(
            "flex w-full snap-center items-center justify-center text-xl tabular-nums transition-colors",
            it === value ? "font-semibold text-foreground" : "text-muted-foreground/60",
          )}
          style={{ height: ITEM }}
        >
          {it}
        </button>
      ))}
      <div style={{ height: ITEM * 2 }} />
    </div>
  );
}

export function TimeWheelPicker({ times, value, onChange }: { times: string[]; value: string; onChange: (v: string) => void }) {
  const hours = useMemo(() => Array.from(new Set(times.map((t) => t.slice(0, 2)))), [times]);
  const h = value ? value.slice(0, 2) : "";
  const mins = useMemo(() => times.filter((t) => t.startsWith(`${h}:`)).map((t) => t.slice(3)), [times, h]);

  // Garante sempre um horário válido selecionado.
  useEffect(() => {
    if (times.length && !times.includes(value)) onChange(times[0]);
  }, [times, value, onChange]);

  if (!times.length) return <p className="text-sm text-muted-foreground">Não há horários livres nesse dia. Escolha outro.</p>;

  const pickHour = (nh: string) => {
    const m = value.slice(3);
    onChange(times.includes(`${nh}:${m}`) ? `${nh}:${m}` : times.find((t) => t.startsWith(`${nh}:`)) || times[0]);
  };

  return (
    <div className="relative flex items-center justify-center gap-1 rounded-xl bg-muted/40 py-1">
      <div className="pointer-events-none absolute inset-x-4 top-1/2 h-10 -translate-y-1/2 rounded-lg bg-primary/10" />
      <Wheel items={hours} value={h} onChange={pickHour} ariaLabel="Hora" />
      <span className="relative text-xl font-semibold text-foreground">:</span>
      <Wheel items={mins} value={value.slice(3)} onChange={(m) => onChange(`${h}:${m}`)} ariaLabel="Minutos" />
    </div>
  );
}
