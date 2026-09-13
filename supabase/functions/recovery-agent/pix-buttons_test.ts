import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyPixButton, classifyTasterIntent } from "./pix-buttons.ts";

Deno.test("erro natural no código pede substituição do PIX recorrente", () => {
  for (const text of [
    "O código está dando erro no meu banco",
    "Aparece no aplicativo do banco mensagem de erro novamente",
    "Erro na chave pix",
    "Gera outro código para mim",
    "O banco recusou o QR",
  ]) {
    assertEquals(classifyPixButton(text), "replace_code", text);
  }
});

Deno.test("código que não chegou pede somente reenvio", () => {
  assertEquals(classifyPixButton("Não chegou o código"), "resend_code");
  assertEquals(classifyPixButton("Pode reenviar o pix?"), "resend_code");
});

Deno.test("aceite curto herda a oferta recente de gerar novo código", () => {
  assertEquals(
    classifyPixButton("Sim", "Quer que eu gere um novo código PIX agora?"),
    "replace_code",
  );
  assertEquals(classifyPixButton("Sim", "Quer conhecer melhor a Aura?"), null);
});

Deno.test("erro técnico recorrente não vira encontro avulso", () => {
  const text = "O código da assinatura deu erro no banco";
  assertEquals(classifyPixButton(text), "replace_code");
  assertEquals(classifyTasterIntent(text), null);
});