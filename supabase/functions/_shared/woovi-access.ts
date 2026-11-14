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
/**
 * Carência da recuperação silenciosa: débito recusado com mandato vivo (o
 * cliente não cancelou) mantém o acesso enquanto a Woovi retenta. Paridade com
 * os Smart Retries do cartão; o encerramento vem do woovi_recovery_final.
 * Não vale para entrada de teste (quem nunca pagou mensalidade).
 */
export const RECOVERY_GRACE_DAYS = 28;
const DAY_MS = 86400000;

/** Validade a que o cliente tem direito: período pago + carência se o mandato segue vivo. */
export function entitledAccessUntil(
  paidAt: string, kind: string, billingPeriod: string | null | undefined, mandateAlive: boolean,
): { paidUntil: Date; entitledUntil: Date } {
  const isCycle = String(kind) === "cycle";
  const days = isCycle ? cycleAccessDays(billingPeriod) : ENTRY_ACCESS_DAYS;
  const paidUntil = new Date(Date.parse(paidAt) + days * DAY_MS);
  const grace = isCycle && mandateAlive ? RECOVERY_GRACE_DAYS : 0;
  return { paidUntil, entitledUntil: new Date(paidUntil.getTime() + grace * DAY_MS) };
}
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

  async function latestPaidCharge(filter: { column: string; value: string | string[] }): Promise<Record<string, any> | null> {
    let query = supabase
      .from("woovi_charges")
      .select("kind, paid_at, due_date, status")
      .not("paid_at", "is", null)
      .order("paid_at", { ascending: false })
      .limit(1);
    if (Array.isArray(filter.value)) {
      query = query.in(filter.column, filter.value);
    } else {
      query = query.eq(filter.column, filter.value);
    }
    const { data } = await query;
    return Array.isArray(data) ? data[0] : null;
  }

  let last = await latestPaidCharge({ column: "user_id", value: userId });

  // Fallback: cobranças cujo vínculo com o cliente ainda não foi preenchido.
  if (!last?.paid_at) {
    const { data: subs } = await supabase
      .from("woovi_subscriptions")
      .select("subscription_id")
      .eq("user_id", userId)
      .not("subscription_id", "is", null);
    const ids = (subs || []).map((s: any) => s.subscription_id).filter(Boolean);
    if (ids.length > 0) {
      last = await latestPaidCharge({ column: "subscription_id", value: ids });
    }
  }

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

  const { data: mandates } = await supabase
    .from("woovi_subscriptions")
    .select("status, replaced_by_subscription_id")
    .eq("user_id", userId);
  const mandateAlive = (mandates || []).some((m: any) =>
    ["APROVADA", "ATIVA"].includes(String(m.status)) && !m.replaced_by_subscription_id);

  const { paidUntil, entitledUntil: until } = entitledAccessUntil(
    String(last.paid_at), String(last.kind), profile.billing_cycle, mandateAlive,
  );

  const current = profile.plan_expires_at ? Date.parse(String(profile.plan_expires_at)) : 0;
  // Encurta o que passou do direito. Só estende para devolver a carência a
  // quem foi cortado no fim do período pago com mandato vivo (validade antiga
  // menor que o pago pode vir de cancelamento pedido e fica como está).
  const restoreGrace = mandateAlive && current > 0
    && current >= paidUntil.getTime() - DAY_MS && current < until.getTime();
  if (!current || (current <= until.getTime() && !restoreGrace)) {
    return { capped: false, reason: "validade já compatível com o pago" };
  }

  await supabase
    .from("profiles")
    .update({ plan_expires_at: until.toISOString() })
    .eq("id", userId);

  return { capped: true, until: until.toISOString(), reason: restoreGrace ? "carência de recuperação" : "alinhado ao pago" };
}
