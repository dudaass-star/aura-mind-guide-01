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
      <div className="grid grid-cols-4 gap-1 p-1 bg-white/5 rounded-2xl border border-white/10">
        {items.map((item) => {
          const active = item.id === value;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              aria-pressed={active}
              className={`relative flex flex-col items-center justify-center gap-0.5 px-1.5 py-2 rounded-xl transition-all ${
                active
                  ? "bg-[hsl(140_22%_45%)] text-white shadow-md"
                  : "text-white/70 hover:text-white hover:bg-white/5"
              }`}
            >
              <span className="text-xs font-medium leading-none">{item.label}</span>
              <span
                className={`text-[11px] font-semibold leading-none ${
                  active ? "text-white" : "text-[hsl(140_30%_72%)]"
                }`}
              >
                R$ {item.monthlyEquivalent}
                <span className={active ? "text-white/75" : "text-white/50"}>/mês</span>
              </span>
              {item.discount > 0 && (
                <span
                  className={`mt-0.5 text-[9px] font-bold px-1 py-0.5 rounded leading-none ${
                    active ? "bg-white/20 text-white" : "bg-[hsl(35_70%_60%)] text-[hsl(220_35%_12%)]"
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
        <p className="text-center text-[11px] text-white/60">
          {selected.savings > 0 ? (
            <>
              <span className="text-white/85">R$ {selected.total}</span> à vista por{" "}
              {selected.periodLabel} ·{" "}
              <span className="inline-flex items-center gap-1 text-[hsl(140_30%_72%)] font-semibold">
                <Check className="w-3 h-3" />
                economize R$ {fmt(selected.savings)}
              </span>
            </>
          ) : (
            <>
              <span className="text-white/85">R$ {selected.total}</span> por mês · sem
              compromisso de tempo
            </>
          )}
        </p>
      )}
    </div>
  );
}
