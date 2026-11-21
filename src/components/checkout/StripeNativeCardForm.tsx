import { useState } from "react";
import type { Stripe as StripeJs } from "@stripe/stripe-js";
import {
  CheckoutElementsProvider,
  PaymentElement,
  useCheckoutElements,
} from "@stripe/react-stripe-js/checkout";
import { Lock, Loader2 } from "lucide-react";
import { logFunnel } from "@/lib/checkout-funnel";

/**
 * Formulário de cartão compacto (Payment Element + Checkout Sessions ui_mode=elements).
 * Mostra só número/validade/CVC; o botão de pagar é o nosso, para caber na
 * primeira dobra do celular. A conclusão continua chegando pelo webhook
 * checkout.session.completed, igual ao formato anterior.
 */
interface Props {
  stripe: Promise<StripeJs | null>;
  clientSecret: string;
  amountLabel: string;
  renewalLabel: string;
  plan: string;
  billing: string;
  onReady: () => void;
}

const appearance = {
  theme: "stripe" as const,
  variables: {
    colorPrimary: "#4f7a5a",
    colorBackground: "#ffffff",
    colorText: "#1a2536",
    colorDanger: "#c0392b",
    borderRadius: "12px",
    spacingUnit: "3px",
    fontSizeBase: "15px",
  },
};

function Inner({ amountLabel, renewalLabel, plan, billing, onReady }: Omit<Props, "stripe" | "clientSecret">) {
  const state = useCheckoutElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pay = async () => {
    if (state.type !== "success") return;
    setBusy(true);
    setError(null);
    logFunnel("card_submit_clicked", { plan, billing, paymentMethod: "card" });
    const res = await state.checkout.confirm();
    if (res.type === "error") {
      setError(res.error.message || "Não foi possível concluir. Confira os dados do cartão.");
      logFunnel("card_confirm_error", { plan, billing, paymentMethod: "card", detail: res.error.message });
      setBusy(false);
    }
    // Sucesso: a Stripe redireciona para /obrigado.
  };

  return (
    <div className="space-y-3">
      <PaymentElement
        options={{ layout: "tabs", fields: { billingDetails: { address: "never" } }, terms: { card: "never" } } as any}
        onReady={onReady}
      />
      {error && <p className="text-xs text-red-300">{error}</p>}
      <button
        type="button"
        onClick={pay}
        disabled={busy || state.type !== "success"}
        className="w-full h-12 rounded-xl bg-[hsl(140_22%_45%)] hover:bg-[hsl(140_22%_40%)] text-[hsl(0_0%_100%)] font-semibold text-base flex items-center justify-center gap-2 disabled:opacity-60 transition-colors"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
        {busy ? "Confirmando…" : `Pagar ${amountLabel}`}
      </button>
      <p className="text-[11px] text-white/60 text-center leading-snug">{renewalLabel}</p>
    </div>
  );
}

export function StripeNativeCardForm({ stripe, clientSecret, ...rest }: Props) {
  return (
    <CheckoutElementsProvider
      stripe={stripe}
      options={{ clientSecret, elementsOptions: { appearance } } as any}
    >
      <Inner {...rest} />
    </CheckoutElementsProvider>
  );
}
