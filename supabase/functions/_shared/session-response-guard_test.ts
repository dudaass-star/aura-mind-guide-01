import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { hasUnansweredSessionTurn } from './session-response-guard.ts';
Deno.test('turno sem resposta impede conclusão por silêncio', () => {
  assertEquals(hasUnansweredSessionTurn('turno', []), true);
  assertEquals(hasUnansweredSessionTurn('turno', [{ metadata: { kind: 'response_failure', reply_to_message_id: 'turno' } }]), true);
  assertEquals(hasUnansweredSessionTurn('turno', [{ metadata: { reply_to_message_id: 'anterior' } }]), true);
});
Deno.test('resposta ao turno atual libera regra normal de silêncio', () => {
  assertEquals(hasUnansweredSessionTurn('turno', [{ metadata: { reply_to_message_id: 'turno' } }]), false);
  assertEquals(hasUnansweredSessionTurn(null, []), false);
});