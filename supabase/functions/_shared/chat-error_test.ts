import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { describeChatError, shouldRecoverChatTurn } from './chat-error.ts';

Deno.test('erro de dados preserva código e detalhes em vez de object Object', () => {
  const result = describeChatError({ message: 'Falha de validação', code: '23505', details: 'registro duplicado' });
  assertStringIncludes(result.message, '23505');
  assertStringIncludes(result.message, 'registro duplicado');
});

Deno.test('retomada é limitada a falhas transitórias e cessa depois da resposta', () => {
  assertEquals(shouldRecoverChatTurn(new Error('Agent HTTP 500'), 0, false), true);
  assertEquals(shouldRecoverChatTurn(new Error('Agent HTTP 429'), 1, false), true);
  assertEquals(shouldRecoverChatTurn(new Error('Agent HTTP 403'), 0, false), false);
  assertEquals(shouldRecoverChatTurn(new Error('Agent HTTP 500'), 2, false), false);
  assertEquals(shouldRecoverChatTurn(new Error('Agent HTTP 500'), 0, true), false);
});