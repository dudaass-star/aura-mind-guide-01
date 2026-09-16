import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isExplicitStopRequest, isHumanRequest, isLiteAcceptance } from "./retention-intents.ts";

Deno.test("objeção comercial não vira opt-out permanente", () => {
  assertEquals(isExplicitStopRequest("Não quero autorizar R$ 29,90"), false);
  assertEquals(isExplicitStopRequest("Daí não quero porque ficou caro"), false);
});

Deno.test("pedido inequívoco de silêncio continua bloqueando", () => {
  assertEquals(isExplicitStopRequest("Pare de me mandar mensagem"), true);
  assertEquals(isExplicitStopRequest("Não quero mais receber mensagens"), true);
  assertEquals(isExplicitStopRequest("Remova meu número da lista"), true);
  assertEquals(isHumanRequest("Quero falar com um atendente humano"), true);
});

Deno.test("aceite do Lite reconhece grafia Life somente no fast-path contextual", () => {
  assertEquals(isLiteAcceptance("Quero o Lite"), true);
  assertEquals(isLiteAcceptance("Quero o Life"), true);
  assertEquals(isLiteAcceptance("Pode me mandar o plano Lite"), true);
  assertEquals(isLiteAcceptance("A vida é curta, life goes on"), false);
});