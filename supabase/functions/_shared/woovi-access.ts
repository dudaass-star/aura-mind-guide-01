/**
 * Acesso do trilho PIX Automático (Woovi) amarrado ao dinheiro que ENTROU.
 *
 * Caso real que motivou este arquivo: cliente do plano Transformação pagou só a
 * entrada de teste, o ciclo mensal nunca foi debitado (a Woovi recusou a ordem
 * com "a parcela já tem cobr") e o perfil seguiu liberado por mais de um mês.
 * Reconciliação de pagamento antigo também não pode "renovar" o acesso a partir
 * do dia em que a auditoria rodou — a validade parte da data do PAGAMENTO.
 *
 * Regra: validade = último pagamento registrado em `woovi_charges`
 *   • entrada (semanal de teste) → +8 dias
 *   • mensalidade (ciclo)        → janela do CICLO contratado
 *       mensal 31 · trimestral 92 · semestral 184 · anual 366
 * Só ENCURTA. Nunca estende acesso, nunca corta quem tem mensalidade em dia, e
 * nunca mexe em perfil sem nenhum pagamento registrado (outro trilho pode ser o
 * dono da validade).
 *
 * Caso real (Cris Silveiira, 09/09/2026): trimestral pago em 20/08 estava com
 * acesso até 20/02/2027 — o dobro do pago — porque a janela de ciclo era fixa em
 * 31 dias e não distinguia trimestral/semestral/anual.
 *
 * Quem migrou de meio de pagamento fica FORA desta regra: se o cliente passou
 * pro cartão, quem manda na validade é a fatura da Stripe, e aplicar o teto do
 * último PIX cortaria o acesso de um cliente em dia.
 */
export const ENTRY_ACCESS_DAYS = 8;
export const CYCLE_ACCESS_DAYS = 31;

/** Dias de acesso comprados por um pagamento de ciclo, por período contratado. */
export const CYCLE_DAYS_BY_PERIOD: Record<string, number> = {
  monthly: 31,
  mensal: 31,
  quarterly: 92,
  trimestral: 92,
  semiannual: 184,
  semestral: 184,
  yearly: 366,
  anual: 366,
};

export function cycleAccessDays(billingPeriod: string | null | undefined): number {
  const key = String(billingPeriod || "monthly").toLowerCase();
  return CYCLE_DAYS_BY_PERIOD[key] ?? CYCLE_ACCESS_DAYS;
}

export async function enforceWooviAccessCap(
  supabase: any,
  userId: string | null | undefined,
): Promise<{ capped: boolean; until?: string; reason?: string }> {
  if (!userId) return { capped: false, reason: "sem user_id" };

  const { data: paid } = await supabase
    .from("woovi_charges")
    .select("kind, paid_at, due_date, status")
    .eq("user_id", userId)
    .not("paid_at", "is", null)
    .order("paid_at", { ascending: false })
    .limit(1);

  const last = Array.isArray(paid) ? paid[0] : null;
  if (!last?.paid_at) return { capped: false, reason: "nenhum pagamento registrado" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, plan_expires_at, card_gateway, billing_cycle")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return { capped: false, reason: "perfil não encontrado" };

  // Cliente que saiu do PIX (migrou pro cartão, por exemplo) não é regido aqui.
  if (profile.card_gateway && String(profile.card_gateway) !== "woovi") {
    return { capped: false, reason: `outro gateway (${profile.card_gateway})` };
  }

  const days = String(last.kind) === "cycle"
    ? cycleAccessDays(profile.billing_cycle)
    : ENTRY_ACCESS_DAYS;
  const until = new Date(Date.parse(String(last.paid_at)) + days * 86400000);

  const current = profile.plan_expires_at ? Date.parse(String(profile.plan_expires_at)) : 0;
  // Só encurta. Acesso mais curto que o pago segue como está (pode vir de
  // cancelamento pedido pelo cliente).
  if (!current || current <= until.getTime()) {
    return { capped: false, reason: "validade já compatível com o pago" };
  }

  await supabase
    .from("profiles")
    .update({ plan_expires_at: until.toISOString() })
    .eq("id", userId);

  return { capped: true, until: until.toISOString() };
}
