// Seletor de meio de pagamento do checkout.
// Antes existiam dois botões empilhados (um cheio, um contornado) com preços
// diferentes no rótulo — o PIX parecia "opção secundária e mais caro".
// Agora o método é uma escolha explícita e o valor aparece uma única vez.
import { CreditCard, QrCode } from "lucide-react";

export type PayMethod = "card" | "pix";

interface PaymentMethodToggleProps {
  value: PayMethod;
  onChange: (m: PayMethod) => void;
  /** Rótulo curto sob cada opção (ex.: "7 dias por R$ 9,90" / "R$ 49,90/mês") */
  cardHint: string;
  pixHint: string;
}

const options: { id: PayMethod; label: string; Icon: typeof CreditCard }[] = [
  { id: "card", label: "Cartão", Icon: CreditCard },
  { id: "pix", label: "PIX Automático", Icon: QrCode },
];

export function PaymentMethodToggle({
  value,
  onChange,
  cardHint,
  pixHint,
}: PaymentMethodToggleProps) {
  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Forma de pagamento">
      {options.map(({ id, label, Icon }) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(id)}
            className={`flex items-center gap-2.5 rounded-xl border px-3 py-3 text-left transition-all ${
              active
                ? "border-[hsl(var(--ck-cta))] bg-[hsl(var(--ck-cta)/0.14)]"
                : "border-[hsl(var(--ck-line))] bg-[hsl(var(--ck-text)/0.04)] hover:border-[hsl(var(--ck-line))] hover:bg-[hsl(var(--ck-text)/0.07)]"
            }`}
          >
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                active
                  ? "bg-[hsl(var(--ck-cta))] text-[hsl(var(--ck-cta-fg))]"
                  : "bg-[hsl(var(--ck-text)/0.08)] text-[hsl(var(--ck-text-soft))]"
              }`}
            >
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span
                className={`block text-sm font-semibold leading-tight ${
                  active ? "text-[hsl(var(--ck-text))]" : "text-[hsl(var(--ck-text-soft))]"
                }`}
              >
                {label}
              </span>
              <span className="ck-num block text-[11px] leading-tight text-[hsl(var(--ck-text-muted))]">
                {id === "card" ? cardHint : pixHint}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
