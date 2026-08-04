// Resumo do pedido (coluna direita no desktop).
// Antes o desktop era uma coluna centrada com ~60% da tela vazia e nenhuma
// prova social acima da dobra. Este painel sticky reforça valor no momento da decisão.
import { Shield, Check, Star } from "lucide-react";

interface OrderSummaryProps {
  planName: string;
  cycleLabel: string;
  /** Valor cobrado agora, formatado (ex.: "9,90") */
  todayAmount: string;
  /** Texto da próxima cobrança (ex.: "R$ 49,90/mês a partir do 8º dia") */
  nextChargeLabel: string;
  benefits: string[];
}

const TESTIMONIALS = [
  { quote: "Em 3 dias senti que alguém finalmente me ouvia.", author: "Ana C." },
  { quote: "Ter alguém às 2h da manhã mudou minhas noites.", author: "Rafael M." },
];

export function OrderSummary({
  planName,
  cycleLabel,
  todayAmount,
  nextChargeLabel,
  benefits,
}: OrderSummaryProps) {
  return (
    <aside className="space-y-4 lg:sticky lg:top-8">
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
        <p className="text-[11px] uppercase tracking-wide text-white/50 mb-3">Seu pedido</p>
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="font-display text-lg font-semibold text-white">{planName}</p>
            <p className="text-xs text-white/60">{cycleLabel}</p>
          </div>
          <div className="text-right">
            <p className="font-display text-2xl font-semibold text-[hsl(140_30%_72%)] leading-none">
              R$ {todayAmount}
            </p>
            <p className="text-[11px] text-white/55 mt-1">cobrado hoje</p>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-white/10 text-[11px] text-white/60">
          {nextChargeLabel}
        </div>

        <ul className="mt-4 space-y-2">
          {benefits.map((b) => (
            <li key={b} className="flex items-start gap-2 text-sm text-white/80">
              <Check className="w-4 h-4 mt-0.5 shrink-0 text-[hsl(140_30%_72%)]" />
              <span>{b}</span>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex items-start gap-2 rounded-xl bg-[hsl(140_22%_45%/0.12)] border border-[hsl(140_22%_45%)]/30 p-3">
          <Shield className="w-4 h-4 mt-0.5 shrink-0 text-[hsl(140_30%_72%)]" />
          <p className="text-[11px] text-white/80 leading-relaxed">
            Garantia de 7 dias: se não fizer sentido pra você, devolvemos sem perguntas.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
        <div className="flex items-center gap-1.5 text-xs text-white/70">
          <Star className="w-3.5 h-3.5 fill-[hsl(35_70%_60%)] text-[hsl(35_70%_60%)]" />
          <span className="font-semibold text-white">4.9/5</span>
          <span>avaliação dos usuários</span>
        </div>
        {TESTIMONIALS.map((t) => (
          <p key={t.author} className="text-xs text-white/65 italic leading-relaxed">
            "{t.quote}" <span className="not-italic text-white/45">— {t.author}</span>
          </p>
        ))}
      </div>
    </aside>
  );
}
