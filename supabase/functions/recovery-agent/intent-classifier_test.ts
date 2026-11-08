import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveIntent, shouldClassify } from "./intent-classifier.ts";

Deno.test("confiança abaixo de 0,8 vira dúvida geral", () => {
  assertEquals(resolveIntent({ intent: "accept_taster", confidence: 0.79 }), "general_doubt");
});

Deno.test("confiança 0,8 ou mais mantém o rótulo", () => {
  assertEquals(resolveIntent({ intent: "accept_taster", confidence: 0.8 }), "accept_taster");
  assertEquals(resolveIntent({ intent: "replace_pix", confidence: 0.95 }), "replace_pix");
});

Deno.test("rótulo desconhecido ou saída vazia vira dúvida geral", () => {
  assertEquals(resolveIntent({ intent: "gerar_assinatura", confidence: 1 }), "general_doubt");
  assertEquals(resolveIntent(null), "general_doubt");
});

Deno.test("texto vazio não chama a IA", () => {
  assertEquals(shouldClassify(" "), false);
  assertEquals(shouldClassify("fechado, manda a chave"), true);
});
