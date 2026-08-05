// Abas de ciclo do checkout V2.
// Motivo: as abas antigas mostravam só "-32% / -50% / -66%" e escondiam o número
// que mais converte (o preço por mês). Agora cada aba carrega o equivalente mensal
// e o rodapé mostra o total do ciclo + economia em reais.
import { Check } from "lucide-react";

export interface CycleTabItem {
  id: string;
  label: string;
  /** Equivalente mensal já formatado (ex.: "16,90") */
  monthlyEquivalent: string;
  /** Total cobrado no ciclo já formatado (ex.: "202,80") */
  total: string;
  /** Rótulo do período ("mês", "trimestre", ...) */
  periodLabel: string;
  discount: number;
  /** Economia em reais no ciclo (0 = sem economia) */
  savings: number;
}

interface CycleTabsProps {
  items: CycleTabItem[];
  value: string;
  onChange: (id: string) => void;
}

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function CycleTabs({ items, value, onChange }: CycleTabsProps) {
  const selected = items.find((i) => i.id === value);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1.5 bg-[hsl(var(--ck-text)/0.05)] rounded-2xl border border-[hsl(var(--ck-line))]">
        {items.map((item) => {
          const active = item.id === value;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              aria-pressed={active}
              className={`relative flex min-h-[3.25rem] flex-col items-center justify-center gap-1 px-2 py-2.5 rounded-xl transition-all ${
                active
                  ? "bg-[hsl(var(--ck-accent))] text-[hsl(var(--ck-text))] shadow-md"
                  : "text-[hsl(var(--ck-text-soft))] hover:bg-[hsl(var(--ck-text)/0.07)]"
              }`}
            >
              <span className="text-[13px] font-medium leading-none">{item.label}</span>
              <span
                className={`ck-num text-xs font-semibold leading-none ${
                  active ? "text-[hsl(var(--ck-text))]" : "text-[hsl(var(--ck-accent-soft))]"
                }`}
              >
                R$ {item.monthlyEquivalent}
                <span className={active ? "opacity-75" : "text-[hsl(var(--ck-text-muted))]"}>/mês</span>
              </span>
              {item.discount > 0 && (
                <span
                  className={`ck-num text-[10px] font-bold px-1.5 py-0.5 rounded leading-none ${
                    active
                      ? "bg-[hsl(var(--ck-text)/0.2)] text-[hsl(var(--ck-text))]"
                      : "bg-[hsl(var(--ck-save)/0.18)] text-[hsl(var(--ck-save))]"
                  }`}
                >
                  -{item.discount}%
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selected && (
        <p className="ck-num text-center text-[11px] text-[hsl(var(--ck-text-muted))]">
          {selected.savings > 0 ? (
            <>
              <span className="text-[hsl(var(--ck-text-soft))]">R$ {selected.total}</span> à vista por{" "}
              {selected.periodLabel} ·{" "}
              <span className="inline-flex items-center gap-1 text-[hsl(var(--ck-save))] font-semibold">
                <Check className="w-3 h-3" />
                economize R$ {fmt(selected.savings)}
              </span>
            </>
          ) : (
            <>
              <span className="text-[hsl(var(--ck-text-soft))]">R$ {selected.total}</span> por mês · sem
              compromisso de tempo
            </>
          )}
        </p>
      )}
    </div>
  );
}
