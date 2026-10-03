import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { encontrarCobrancaUnicaPorE2E, localizarEndToEndId } from "../_shared/woovi-dispute-matcher.ts";

Deno.test("localiza o End-to-End ID dentro do payload real de parcela", () => {
  const e2e = "E54811417202609271500ZdTdNS96kU6";
  assertEquals(localizarEndToEndId({ installment: { cobr: { endToEndId: e2e } } }), e2e);
});

Deno.test("aceita variações de caixa e envelope", () => {
  assertEquals(localizarEndToEndId({ data: [{ end_to_end_id: "E123" }] }), "E123");
});

Deno.test("encontra uma única cobrança pelo payload mesmo com installment_id diferente", () => {
  const resultado = encontrarCobrancaUnicaPorE2E([
    { id: "c1", installment_id: "correlation-id", raw_payload: { installment: { cobr: { endToEndId: "E123" } } } },
  ], "E123");
  assertEquals(resultado.cobranca?.id, "c1");
  assertEquals(resultado.ambiguo, false);
});

Deno.test("não escolhe cliente quando duas cobranças contêm o mesmo identificador", () => {
  const resultado = encontrarCobrancaUnicaPorE2E([
    { id: "c1", raw_payload: { endToEndId: "E123" } },
    { id: "c2", raw_payload: { endToEndId: "E123" } },
  ], "E123");
  assertEquals(resultado.cobranca, null);
  assertEquals(resultado.ambiguo, true);
});