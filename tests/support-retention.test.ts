import { expect, test } from "bun:test";
import {
  canRenewSupportOffer, offerIsPayable, retentionTerms, selectSupportOffer, supportOfferDecision,
  supportRenewalRequest, type SupportRetentionOffer,
} from "../supabase/functions/_shared/support-retention";

const now = Date.parse("2026-11-28T04:02:00Z");
const original: SupportRetentionOffer = {
  id: "oferta-original", profile_user_id: "cliente", profile_id: "perfil", tier: "discount_30",
  gateway: "woovi", plan: "essencial", billing_cycle: "monthly", amount_cents: null,
  status: "expired", origin: "winback_d14", created_at: "2026-11-14T13:00:00Z",
  expires_at: "2026-11-21T13:00:00Z", sent_at: "2026-11-14T13:00:12Z",
};
const active = { ...original, status: "sent", expires_at: "2026-12-05T13:00:00Z" };
const decision = (offer: SupportRetentionOffer | null, failed = false, gateway = "woovi") =>
  supportOfferDecision(offer, "cliente", "perfil", gateway, "essencial", "monthly", failed, now);

test("a oferta de 30% do Essencial de R$29,90 cobra exatamente R$20,93", () => {
  expect(retentionTerms(original, null, null)).toEqual({ plan: "essencial", billing: "monthly", amountCents: 2093 });
});
test("não promete R$20,90 quando a cobrança calcula R$20,93", () => {
  expect(retentionTerms({ ...active, amount_cents: 2090 }, null, null)).toBeNull();
  expect(decision({ ...active, amount_cents: 2090 }).blocked).toBe(true);
});
test("oferta vencida continua visível mas impede PIX silencioso de preço cheio", () => {
  expect(selectSupportOffer([original], "cliente", "perfil")?.id).toBe("oferta-original");
  expect(decision(original).blocked).toBe(true);
  expect(decision(original).ready).toBe(false);
});
test("oferta válida segue para cobrança identificada por seu registro, não só pelo tier", () => {
  expect(decision(active).ready).toBe(true);
  expect(decision(active).blocked).toBe(false);
  expect(supportRenewalRequest("token-de-teste", active)).toEqual({ action: "create", token: "token-de-teste", retentionOfferId: "oferta-original" });
});
test("falha de consulta comercial impede gerar preço cheio", () => {
  expect(decision(null, true).blocked).toBe(true);
});
test("renovação sem oferta preserva o fluxo existente", () => {
  expect(decision(null).blocked).toBe(false);
  expect(supportRenewalRequest("token-de-teste", null)).toEqual({ action: "create", token: "token-de-teste" });
});
test("oferta de outro cliente não entra no contexto nem autoriza cobrança", () => {
  expect(selectSupportOffer([original], "outro", "perfil")).toBeNull();
  expect(offerIsPayable(active, "outro", "perfil", now)).toBe(false);
});
test("perfil diferente também impede cobrança com o mesmo user_id", () => {
  expect(offerIsPayable(active, "cliente", "outro-perfil", now)).toBe(false);
});
test("oferta criada mas nunca enviada não é apresentada como promessa", () => {
  expect(selectSupportOffer([{ ...active, sent_at: null, status: "created" }], "cliente", "perfil")).toBeNull();
});
test("uma oferta recusada mais recente não ressuscita o desconto antigo", () => {
  const declined = { ...active, id: "base-recusado", tier: "base", status: "declined", created_at: "2026-11-27T13:00:00Z" };
  const selected = selectSupportOffer([active, declined], "cliente", "perfil");
  expect(selected?.id).toBe("base-recusado");
  expect(decision(selected).blocked).toBe(true);
});
test("ofertas pagas e aplicadas não permitem novo QR de retenção", () => {
  for (const status of ["paid", "applied", "declined", "failed"]) {
    expect(offerIsPayable({ ...active, status }, "cliente", "perfil", now)).toBe(false);
  }
});
test("Lite e Base permanecem distintos e mensais para quem vinha do anual", () => {
  expect(retentionTerms({ ...active, tier: "lite", billing_cycle: "yearly" }, null, null))
    .toEqual({ plan: "essencial", billing: "monthly", amountCents: 1990 });
  expect(retentionTerms({ ...active, tier: "base", billing_cycle: "yearly" }, null, null))
    .toEqual({ plan: "essencial", billing: "monthly", amountCents: 990 });
});
test("outros provedores não recebem um PIX de preço cheio no lugar do desconto", () => {
  expect(decision(active, false, "inter").blocked).toBe(true);
});
test("renovação autorizada só reutiliza condição vencida e comunicada do mesmo titular", () => {
  expect(canRenewSupportOffer(original, "cliente", "perfil", now)).toBe(true);
  expect(canRenewSupportOffer(active, "cliente", "perfil", now)).toBe(false);
  expect(canRenewSupportOffer(original, "outro", "perfil", now)).toBe(false);
  expect(canRenewSupportOffer({ ...original, sent_at: null }, "cliente", "perfil", now)).toBe(false);
  expect(canRenewSupportOffer({ ...original, status: "declined" }, "cliente", "perfil", now)).toBe(false);
});
test("sucessora aprovada fica disponível sem reescrever a oferta anterior", () => {
  const successor = { ...active, id: "sucessora", status: "created", origin: "support_offer_renewal",
    created_at: "2026-11-28T04:02:00Z", sent_at: null, amount_cents: 2093 };
  expect(selectSupportOffer([original, successor], "cliente", "perfil")?.id).toBe("sucessora");
  expect(offerIsPayable(successor, "cliente", "perfil", now)).toBe(true);
});