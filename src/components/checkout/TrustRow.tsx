// Linha compacta de confiança usada acima da dobra (logo abaixo do seletor de plano).
// Objetivo: quem decide sem rolar até o rodapé já vê garantia, segurança e cancelamento.
import { Shield, Lock, Check } from "lucide-react";

export function TrustRow({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-[11px] text-[hsl(var(--ck-text-muted))] ${className}`}
    >
      <span className="inline-flex items-center gap-1.5">
        <Shield className="w-3.5 h-3.5 text-[hsl(var(--ck-accent))]" />
        Garantia de 7 dias
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Lock className="w-3.5 h-3.5 text-[hsl(var(--ck-accent))]" />
        Pagamento criptografado
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Check className="w-3.5 h-3.5 text-[hsl(var(--ck-accent))]" />
        Cancele quando quiser
      </span>
    </div>
  );
}
