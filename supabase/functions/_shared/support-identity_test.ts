import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { extractBrazilPhones, normalizeEmail } from "./support-identity.ts";

Deno.test("Gmail com e sem ponto viram o mesmo e-mail", () => {
  assertEquals(normalizeEmail("vanessabp3@gmail.com"), normalizeEmail("Vanessa.bp3@gmail.com"));
});
Deno.test("outros domínios mantêm os pontos", () => {
  assertEquals(normalizeEmail("a.b@uol.com.br") === normalizeEmail("ab@uol.com.br"), false);
});
Deno.test("telefone no rodapé do e-mail é extraído no padrão 55+DDD+9", () => {
  assertEquals(extractBrazilPhones(["Tel. (11) 99335-7011"]), ["5511993357011"]);
});
