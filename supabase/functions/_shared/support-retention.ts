import { PIX_PLAN_PRICES } from "./pix-plan-prices.ts";
import { offerValueCents, retentionBillingCycle } from "./retention-prices.ts";

export interface SupportRetentionOffer {
  id: string;
  profile_user_id: string;
  profile_id: string | null;
  tier: string;
  gateway: string;
  plan: string | null;
  billing_cycle: string | null;
  amount_cents: number | null;
  status: string;
  origin: string;
  created_at: string;
  expires_at: string;
  sent_at: string | null;
  delivered_at?: string | null;
  metadata?: Record<string, unknown>;
}

export const SUPPORT_OFFER_COLUMNS = "id,profile_user_id,profile_id,tier,gateway,plan,billing_cycle,amount_cents,status,origin,created_at,expires_at,sent_at,delivered_at,metadata";
const TIERS = new Set(["discount_30", "lite", "base"]);
const CLOSED = new Set(["failed", "declined", "paid", "applied"]);

export function offerWasPromised(offer: SupportRetentionOffer): boolean {
  return !!(offer.sent_at || offer.delivered_at || offer.origin === "support_offer_renewal");
}

export function retentionTerms(offer: SupportRetentionOffer, fallbackPlan: string | null, fallbackCycle: string | null) {
  const plan = offer.plan || fallbackPlan || "";
  const billing = retentionBillingCycle(offer.tier, offer.billing_cycle || fallbackCycle || "monthly");
  const full = PIX_PLAN_PRICES[plan]?.[billing];
  if (!TIERS.has(offer.tier) || !full) return null;
  const amountCents = offerValueCents(offer.tier, full);
  // Nunca prometer um preço que o gerador não consegue cobrar.
  if (offer.amount_cents != null && offer.amount_cents !== amountCents) return null;
  return { plan, billing, amountCents };
}

export function offerIsPayable(offer: SupportRetentionOffer, userId: string, profileId: string, now = Date.now()): boolean {
  return offer.profile_user_id === userId && (!offer.profile_id || offer.profile_id === profileId)
    && TIERS.has(offer.tier) && !CLOSED.has(offer.status) && offer.status !== "expired"
    && Number.isFinite(Date.parse(offer.expires_at)) && Date.parse(offer.expires_at) > now;
}

export function selectSupportOffer(offers: SupportRetentionOffer[], userId: string, profileId: string) {
  // A oferta mais recente comunicada é a referência; não ressuscita outra após recusa/pagamento.
  return offers.filter(o => o.profile_user_id === userId && (!o.profile_id || o.profile_id === profileId)
    && TIERS.has(o.tier) && offerWasPromised(o))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0] || null;
}

export function canRenewSupportOffer(offer: SupportRetentionOffer, userId: string, profileId: string, now = Date.now()): boolean {
  return offer.profile_user_id === userId && (!offer.profile_id || offer.profile_id === profileId)
    && TIERS.has(offer.tier) && offer.gateway === "woovi" && offerWasPromised(offer)
    && !CLOSED.has(offer.status) && Number.isFinite(Date.parse(offer.expires_at))
    && Date.parse(offer.expires_at) <= now;
}

export function supportOfferDecision(offer: SupportRetentionOffer | null, userId: string, profileId: string,
  gateway: string | null, plan: string | null, cycle: string | null, lookupFailed: boolean, now = Date.now()) {
  const terms = offer ? retentionTerms(offer, plan, cycle) : null;
  const ready = !!offer && !!terms && gateway === "woovi" && offerIsPayable(offer, userId, profileId, now);
  return { terms, ready, blocked: lookupFailed || (!!offer && !ready) };
}

export function supportRenewalRequest(token: string, offer: SupportRetentionOffer | null) {
  return { action: "create", token, ...(offer ? { retentionOfferId: offer.id } : {}) };
}

export const SUPPORT_RETENTION_POLICY = `
HISTÓRICO COMERCIAL E OFERTAS (INVIOLÁVEL):
- retention_history contém ofertas realmente registradas, sem conteúdo das conversas pessoais. Consulte-o mesmo quando o cliente mencionar uma condição anterior com outras palavras.
- Reconheça a condição localizada e use tier, amount_brl, billing e datas *_brt do contexto. Lite e Base são diferentes; não confunda suas entregas com o plano completo.
- Uma oferta registrada prevalece sobre exemplos de preço cheio da base de conhecimento. Não invente valor, prazo ou duração do desconto.
- pix_renewal.offer_status = ready: use somente renewal_url e copy_paste desse contexto; explique com naturalidade a condição encontrada, sem jargão.
- offer_status = review_required: a oferta existe, mas venceu, foi recusada/usada ou precisa de conferência. Reconheça a condição e diga que a equipe vai conferir sua disponibilidade; ação none e revisão humana. Nunca diga que reativou, honrou ou prorrogou sem approved_renewal no contexto. Nunca substitua silenciosamente por PIX de valor cheio.
- offer_status = unavailable: não invente desconto nem link; acolha o interesse em voltar e encaminhe a conferência à equipe. Código falhou: não ofereça outro valor.
- approved_renewal = true significa que a equipe autorizou uma nova oferta rastreável, não que houve pagamento ou liberação de acesso. Ainda é necessária a confirmação do banco.
- Se o cliente apenas relata uma oferta e nenhuma foi localizada, não negue sua experiência: diga que vai conferir e peça o aviso recebido se necessário. Não ofereça preço cheio como se fosse a condição mencionada.
`;