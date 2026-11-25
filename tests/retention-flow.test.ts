import { test, expect } from "bun:test";
import { canManageSubscription, retentionOffers } from "../src/lib/retention-flow";
import { validCancelRequest } from "../supabase/functions/cancel-subscription/request";
import { offerValueCents, retentionBillingCycle } from "../supabase/functions/_shared/retention-prices";

test("custo: desconto, Lite e Base são ofertas distintas nessa ordem", () => {
  expect(retentionOffers("expensive", "stripe", true)).toEqual(["discount_30", "lite", "base"]);
});
test("falta de tempo: pausa antes do Base", () => {
  expect(retentionOffers("not_using", "stripe", true)).toEqual(["pause", "base"]);
});
test("voltar depois: pausa antes do Base", () => {
  expect(retentionOffers("come_back_later", "stripe", true)).toEqual(["pause", "base"]);
});
test("desconto indisponível não deixa um degrau vazio", () => {
  expect(retentionOffers("expensive", "stripe", false)).toEqual(["lite", "base"]);
});
test("PIX não promete pausa ou desconto sem restauração temporária", () => {
  expect(retentionOffers("expensive", "woovi_pix", true)).toEqual(["lite", "base"]);
  expect(retentionOffers("not_using", "woovi_pix", true)).toEqual(["base"]);
  expect(retentionOffers("expensive", "inter_pix", false)).toEqual([]);
});
test("demo e degustação não gerenciam assinatura inexistente", () => {
  expect(canManageSubscription("demo")).toBe(false);
  expect(canManageSubscription("degustacao")).toBe(false);
  expect(canManageSubscription("active")).toBe(true);
  expect(canManageSubscription("canceling")).toBe(true);
});
test("modo autenticado não aceita identidade de terceiros", () => {
  expect(validCancelRequest({ authenticated: true, action: "check" })).toBe(true);
  expect(validCancelRequest({ authenticated: true, phone: "5511999999999", action: "cancel" })).toBe(false);
  expect(validCancelRequest({ authenticated: true, user_id: "outra-pessoa", action: "cancel" })).toBe(false);
});
test("Lite cobra 19,90 e Base cobra 9,90 também no PIX", () => {
  expect(offerValueCents("lite", 2990)).toBe(1990);
  expect(offerValueCents("base", 2990)).toBe(990);
});
test("Lite e Base são mensais mesmo para quem vinha do anual", () => {
  expect(retentionBillingCycle("lite", "yearly")).toBe("monthly");
  expect(retentionBillingCycle("base", "yearly")).toBe("monthly");
  expect(retentionBillingCycle(null, "yearly")).toBe("yearly");
});