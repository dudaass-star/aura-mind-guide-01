import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CreditCard, Lock, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type BillingPeriod = "monthly" | "quarterly" | "semestral" | "yearly";

interface Props {
  plan: "essencial" | "direcao" | "transformacao";
  billing: BillingPeriod;
  name: string;
  email: string;
  phone: string;
  amountLabel: string;              // "R$ 214,90"
  periodLabel: string;              // "ano"
  installmentMax: number;           // ex: 12
  trial?: boolean;                  // mensal: 1ª cobrança reduzida (R$ 6,90/9,90/19,90)
  fbp?: string;
  fbc?: string;
  gaClientId?: string;
  onBack: () => void;
  onSuccess: () => void;
}

function formatCardNumber(v: string) {
  return v.replace(/\D/g, "").slice(0, 19).replace(/(\d{4})(?=\d)/g, "$1 ");
}
function formatExpiry(v: string) {
  const c = v.replace(/\D/g, "").slice(0, 4);
  if (c.length <= 2) return c;
  return `${c.slice(0, 2)}/${c.slice(2)}`;
}
function formatCep(v: string) {
  const c = v.replace(/\D/g, "").slice(0, 8);
  if (c.length <= 5) return c;
  return `${c.slice(0, 5)}-${c.slice(5)}`;
}

export function AsaasCardForm({
  plan, billing, name, email, phone,
  amountLabel, periodLabel, installmentMax,
  trial,
  fbp, fbc, gaClientId,
  onBack, onSuccess,
}: Props) {
  const [cpf, setCpf] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [holderName, setHolderName] = useState("");
  const [expiry, setExpiry] = useState("");
  const [ccv, setCcv] = useState("");
  const [cep, setCep] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [mode, setMode] = useState<"recurring" | "installment">("recurring");
  const [installments, setInstallments] = useState<number>(2);
  const [loading, setLoading] = useState(false);
  const [pendingReview, setPendingReview] = useState(false);

  const canInstallment = billing !== "monthly";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cpfClean = cpf.replace(/\D/g, "");
    const numClean = cardNumber.replace(/\D/g, "");
    const [em, ey] = expiry.split("/");

    if (cpfClean.length !== 11) return toast.error("CPF inválido");
    if (numClean.length < 13) return toast.error("Número do cartão inválido");
    if (!holderName.trim()) return toast.error("Nome do titular obrigatório");
    if (!em || !ey || em.length !== 2 || ey.length !== 2) return toast.error("Validade inválida (MM/AA)");
    if (ccv.length < 3) return toast.error("CVV inválido");
    if (cep.replace(/\D/g, "").length !== 8) return toast.error("CEP inválido");
    if (!addressNumber.trim()) return toast.error("Número do endereço obrigatório");

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("criar-cartao-asaas", {
        body: {
          plan, billing,
          mode: canInstallment ? mode : "recurring",
          installments: mode === "installment" ? installments : undefined,
          // Trial só faz sentido no monthly recorrente (bate com trialPriceMap do CheckoutV2)
          trial: billing === "monthly" && mode === "recurring" ? (trial ?? true) : false,
          name, email, phone: phone.replace(/\D/g, ""), cpf: cpfClean,
          card: {
            holderName: holderName.trim(),
            number: numClean,
            expiryMonth: em,
            expiryYear: ey,
            ccv,
          },
          holder: {
            name: holderName.trim(),
            email,
            postalCode: cep.replace(/\D/g, ""),
            addressNumber: addressNumber.trim(),
            phone: phone.replace(/\D/g, ""),
            mobilePhone: phone.replace(/\D/g, ""),
          },
          ...(fbp && { fbp }),
          ...(fbc && { fbc }),
          ...(gaClientId && { gaClientId }),
        },
      });
      if (error) throw new Error(error.message || "Erro ao processar cartão");
      if (data?.error) throw new Error(data.error);
      if (data?.success) {
        toast.success("Pagamento aprovado!");
        onSuccess();
      } else if (data?.pending) {
        // Não redireciona pra /obrigado — mostra tela intermediária para o usuário
        // não achar que deu tudo certo antes do webhook Asaas confirmar.
        setPendingReview(true);
      } else {
        throw new Error("Resposta inesperada do provedor");
      }
    } catch (err) {
      console.error("[AsaasCardForm]", err);
      toast.error(err instanceof Error ? err.message : "Erro ao processar pagamento");
    } finally {
      setLoading(false);
    }
  };

  const inputCls = "mt-1.5 bg-white/5 border-white/15 text-white placeholder:text-white/55 focus-visible:ring-1 focus-visible:ring-[hsl(140_18%_55%)]";

  if (pendingReview) {
    return (
      <div className="space-y-5">
        <div className="text-center">
          <h1 className="font-display text-2xl md:text-3xl font-semibold mb-2 tracking-tight">
            Pagamento em análise
          </h1>
          <p className="text-white/70 text-sm">
            Seu cartão passou pela análise antifraude do Asaas. Costuma levar poucos minutos.
          </p>
        </div>
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 space-y-4 text-sm text-white/80">
          <p>
            Assim que aprovar, você recebe uma mensagem no WhatsApp em{" "}
            <span className="font-semibold text-white">{phone}</span> e um email em{" "}
            <span className="font-semibold text-white">{email}</span>.
          </p>
          <p className="text-white/60">
            Pode fechar essa tela — a gente te avisa. Se em 10 minutos nada chegar, entra em contato pelo email <strong className="text-white/80">suporte@olaaura.com.br</strong>.
          </p>
          <Button
            type="button"
            variant="sage"
            size="xl"
            onClick={() => (window.location.href = "/meu-espaco")}
            className="w-full rounded-full"
          >
            Acompanhar no meu espaço
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-white/65 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Editar dados
      </button>

      <div className="text-center">
        <h1 className="font-display text-2xl md:text-3xl font-semibold mb-2 tracking-tight">
          Confirme e pague
        </h1>
        <p className="text-white/70 text-sm">
          <span className="text-[hsl(140_30%_72%)] font-semibold">{amountLabel}</span>{" "}
          / {periodLabel}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 bg-white/[0.03] border border-white/10 rounded-2xl p-5">
        {canInstallment && (
          <div>
            <Label className="text-white/80 text-sm">Forma de pagamento</Label>
            <RadioGroup
              value={mode}
              onValueChange={(v) => setMode(v as "recurring" | "installment")}
              className="mt-2 grid grid-cols-2 gap-2"
            >
              <label className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer text-sm ${
                mode === "recurring" ? "border-[hsl(140_22%_55%)] bg-[hsl(140_22%_45%/0.14)]" : "border-white/10"
              }`}>
                <RadioGroupItem value="recurring" className="border-white/40 text-[hsl(140_22%_55%)]" />
                À vista recorrente
              </label>
              <label className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer text-sm ${
                mode === "installment" ? "border-[hsl(140_22%_55%)] bg-[hsl(140_22%_45%/0.14)]" : "border-white/10"
              }`}>
                <RadioGroupItem value="installment" className="border-white/40 text-[hsl(140_22%_55%)]" />
                Parcelar
              </label>
            </RadioGroup>
            {mode === "installment" && (
              <div className="mt-2">
                <Label className="text-white/80 text-xs">Parcelas</Label>
                <select
                  value={installments}
                  onChange={(e) => setInstallments(Number(e.target.value))}
                  className={`${inputCls} w-full h-10 rounded-md px-3`}
                >
                  {Array.from({ length: installmentMax - 1 }, (_, i) => i + 2).map(n => (
                    <option key={n} value={n} className="bg-[hsl(220_35%_12%)]">{n}x</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        <div>
          <Label htmlFor="asaas-cpf" className="text-white/80 text-sm">CPF do titular</Label>
          <Input
            id="asaas-cpf" inputMode="numeric" maxLength={14}
            value={cpf}
            onChange={(e) => {
              const c = e.target.value.replace(/\D/g, "").slice(0, 11);
              const fmt = c.length <= 3 ? c :
                          c.length <= 6 ? `${c.slice(0,3)}.${c.slice(3)}` :
                          c.length <= 9 ? `${c.slice(0,3)}.${c.slice(3,6)}.${c.slice(6)}` :
                          `${c.slice(0,3)}.${c.slice(3,6)}.${c.slice(6,9)}-${c.slice(9)}`;
              setCpf(fmt);
            }}
            placeholder="000.000.000-00" className={inputCls}
          />
        </div>

        <div>
          <Label htmlFor="asaas-card" className="text-white/80 text-sm">Número do cartão</Label>
          <Input
            id="asaas-card" inputMode="numeric" autoComplete="cc-number"
            value={cardNumber}
            onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
            placeholder="0000 0000 0000 0000" className={inputCls}
          />
        </div>

        <div>
          <Label htmlFor="asaas-holder" className="text-white/80 text-sm">Nome impresso no cartão</Label>
          <Input
            id="asaas-holder" autoComplete="cc-name"
            value={holderName}
            onChange={(e) => setHolderName(e.target.value.toUpperCase())}
            placeholder="COMO ESTÁ NO CARTÃO" className={inputCls}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="asaas-exp" className="text-white/80 text-sm">Validade</Label>
            <Input
              id="asaas-exp" inputMode="numeric" autoComplete="cc-exp" maxLength={5}
              value={expiry}
              onChange={(e) => setExpiry(formatExpiry(e.target.value))}
              placeholder="MM/AA" className={inputCls}
            />
          </div>
          <div>
            <Label htmlFor="asaas-ccv" className="text-white/80 text-sm">CVV</Label>
            <Input
              id="asaas-ccv" inputMode="numeric" autoComplete="cc-csc" maxLength={4}
              value={ccv}
              onChange={(e) => setCcv(e.target.value.replace(/\D/g, ""))}
              placeholder="123" className={inputCls}
            />
          </div>
        </div>

        <div className="grid grid-cols-[1fr_140px] gap-3">
          <div>
            <Label htmlFor="asaas-cep" className="text-white/80 text-sm">CEP</Label>
            <Input
              id="asaas-cep" inputMode="numeric" maxLength={9}
              value={cep}
              onChange={(e) => setCep(formatCep(e.target.value))}
              placeholder="00000-000" className={inputCls}
            />
          </div>
          <div>
            <Label htmlFor="asaas-num" className="text-white/80 text-sm">Número</Label>
            <Input
              id="asaas-num"
              value={addressNumber}
              onChange={(e) => setAddressNumber(e.target.value)}
              placeholder="123" className={inputCls}
            />
          </div>
        </div>

        <Button
          type="submit" variant="sage" size="xl"
          disabled={loading}
          className="w-full rounded-full"
        >
          <CreditCard className="w-5 h-5 mr-2" />
          {loading ? "Processando..." : `Pagar ${amountLabel}`}
        </Button>

        <p className="text-center text-[11px] text-white/55 flex items-center justify-center gap-1.5">
          <Lock className="w-3 h-3" /> Pagamento seguro processado pelo Asaas
        </p>
      </form>
    </div>
  );
}