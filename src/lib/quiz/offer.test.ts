// @ts-ignore -- executado com bun test, fora do typecheck do app
import { describe, expect, it } from "bun:test";
import { INITIAL_OFFER, offerForCheckout } from "./offer";

describe("oferta inicial do quiz", () => {
  it("começa no Essencial mensal, não no anual", () => {
    expect(INITIAL_OFFER).toEqual({ plan: "essencial", billing: "monthly" });
  });
  it("oferece sete dias por R$ 6,90 e continuidade por R$ 29,90", () => {
    expect(offerForCheckout(INITIAL_OFFER.plan, INITIAL_OFFER.billing)).toEqual({
      plan: "essencial", billing: "monthly", today: "6,90", renewal: "29,90", initialDays: 7,
    });
  });
  it("mantém o anual como escolha explícita de R$ 118,80, sem semana inicial", () => {
    expect(offerForCheckout("essencial", "yearly")).toEqual({
      plan: "essencial", billing: "yearly", today: "118,80", renewal: "118,80", initialDays: null,
    });
  });
});