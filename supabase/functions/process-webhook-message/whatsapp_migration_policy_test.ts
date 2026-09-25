import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  getOperationalWhatsAppResponse,
  isImmediateRisk,
  isPortalAccessIntent,
  wantsSessionArea,
} from "./whatsapp-migration-policy.ts";

Deno.test("conversa emocional comum migra ao App", () => {
  const message = "Estou confusa com meu relacionamento e preciso conversar";
  assertEquals(isImmediateRisk(message), false);
  assertEquals(getOperationalWhatsAppResponse(message), null);
  assertEquals(wantsSessionArea(message), false);
});

Deno.test("risco imediato permanece no fluxo de segurança", () => {
  assertEquals(isImmediateRisk("Não aguento mais, quero morrer"), true);
  assertEquals(isImmediateRisk("Estou triste e queria conversar"), false);
});

Deno.test("suporte básico fica no nível 1", () => {
  assertEquals(getOperationalWhatsAppResponse("Como faço para cancelar?")?.level, 1);
  assertEquals(getOperationalWhatsAppResponse("Como ativo as notificações do app?")?.level, 1);
  assertEquals(getOperationalWhatsAppResponse("Onde vejo meu pagamento?")?.level, 1);
});

Deno.test("ações em cadastro, financeiro e privacidade vão ao nível 2", () => {
  assertEquals(getOperationalWhatsAppResponse("Tive uma cobrança duplicada")?.level, 2);
  assertEquals(getOperationalWhatsAppResponse("Quero alterar meu email")?.level, 2);
  assertEquals(getOperationalWhatsAppResponse("Quero excluir meus dados")?.level, 2);
  assertEquals(getOperationalWhatsAppResponse("Não consegui cancelar")?.level, 2);
});

Deno.test("pedidos de sessão abrem a área correta", () => {
  assertEquals(wantsSessionArea("Quero reagendar minha sessão"), true);
  assertEquals(wantsSessionArea("Preciso conversar sobre hoje"), false);
});

Deno.test("frases de recuperação geram novo acesso", () => {
  assertEquals(isPortalAccessIntent("Quero entrar no aplicativo"), true);
  assertEquals(isPortalAccessIntent("Meu link expirou"), true);
  assertEquals(isPortalAccessIntent("Não recebi o código para entrar"), true);
  assertEquals(isPortalAccessIntent("Quero conversar com a Aura"), false);
});