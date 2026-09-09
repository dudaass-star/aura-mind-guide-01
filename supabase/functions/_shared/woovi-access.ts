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
 *   • mensalidade (ciclo)        → +31 dias
 * Só ENCURTA. Nunca estende acesso, nunca corta quem tem mensalidade em dia, e
 * nunca mexe em perfil sem nenhum pagamento registrado (outro trilho pode ser o
 * dono da validade).
 */
export const ENTRY_ACCESS_DAYS = 8;
export const CYCLE_ACCESS_DAYS = 31;

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

  const days = String(last.kind) === "cycle" ? CYCLE_ACCESS_DAYS : ENTRY_ACCESS_DAYS;
  const until = new Date(Date.parse(String(last.paid_at)) + days * 86400000);

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, plan_expires_at")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return { capped: false, reason: "perfil não encontrado" };

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
