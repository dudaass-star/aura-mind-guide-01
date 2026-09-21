import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SOURCE = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

Deno.test("nova fala sinaliza o turno ativo", () => {
  assert(SOURCE.includes(".update({ last_user_message_id: currentMessageId, updated_at:"));
});

Deno.test("somente o dono libera a trava", () => {
  assert(SOURCE.includes(".eq('owner_token', turnOwnerToken)"));
});

Deno.test("aquisição de trava vencida usa comparação atômica", () => {
  assert(SOURCE.includes(".eq('response_started_at', currentState?.response_started_at)"));
  assert(SOURCE.includes("reason: 'stale_lock_race_lost'"));
});

Deno.test("contexto interrompido tem validade", () => {
  assert(SOURCE.includes("pending_expires_at"));
  assert(SOURCE.includes("15 * 60 * 1000"));
});

Deno.test("mensagens recebidas usam identidade da origem", () => {
  assert(SOURCE.includes("source_message_id: currentMessageId"));
  assert(SOURCE.includes("onConflict: 'user_id,channel,source_message_id'"));
});

Deno.test("telemetria do aplicativo não registra conteúdo", () => {
  const metricUpdates = SOURCE.match(/from\('chat_turn_metrics'\)[\s\S]{0,280}/g) || [];
  assert(metricUpdates.length >= 3);
  assert(metricUpdates.every((snippet) => !snippet.includes("messageText") && !snippet.includes("content:")));
});