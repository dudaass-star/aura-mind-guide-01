import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SOURCE = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

Deno.test("nova fala sinaliza o turno ativo", () => {
  assert(SOURCE.includes(".update({ last_user_message_id: currentMessageId, updated_at:"));
  assert(SOURCE.includes("finalTurnState.last_user_message_id !== currentMessageId"));
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
  assert(SOURCE.includes("source_message_id: sourceMessageId"));
  assert(SOURCE.includes("persistirMensagemRecebidaWhatsapp"));
  assert(SOURCE.includes("insertError?.code === '23505'"));
  assert(!SOURCE.includes("onConflict: 'user_id,channel,source_message_id'"));
});

Deno.test("falha ao gravar mensagem recebida interrompe o processamento", () => {
  assert(SOURCE.includes("Falha ao gravar mensagem recebida:"));
  assert(SOURCE.includes("throw persistErr"));
});

Deno.test("telemetria do aplicativo não registra conteúdo", () => {
  const metricUpdates = SOURCE.match(/from\('chat_turn_metrics'\)[\s\S]{0,280}/g) || [];
  assert(metricUpdates.length >= 3);
  assert(metricUpdates.every((snippet) => !snippet.includes("messageText") && !snippet.includes("content:")));
});

Deno.test("convite para o aplicativo é atômico e enviado uma única vez", () => {
  assert(SOURCE.includes(".is('last_app_invite_sent_at', null)"));
  assert(SOURCE.includes("message_variant: 'app_invite'"));
  assert(SOURCE.includes("action: 'app_invite_sent'"));
});

Deno.test("convite não interrompe crise, pagamento ou suporte", () => {
  assert(SOURCE.includes("mustKeepWhatsAppConversation"));
  assert(SOURCE.includes("'vou me matar'"));
  assert(SOURCE.includes("'pagamento'"));
  assert(SOURCE.includes("'suporte'"));
});

Deno.test("falha no convite libera nova tentativa e fica visível", () => {
  assert(SOURCE.includes(".update({ last_app_invite_sent_at: null })"));
  assert(SOURCE.includes("'process-webhook-message:app_invite'"));
  assert(SOURCE.includes("throw inviteError"));
});
Deno.test("heartbeat mantém a trava ativa enquanto o dono processa", () => {
  const source = Deno.readTextFileSync(new URL("../index.ts", import.meta.url));
  if (!source.includes("setInterval(() =>")) throw new Error("heartbeat ausente");
  if (!source.includes(".eq('owner_token', turnOwnerToken)")) throw new Error("heartbeat sem proteção do dono");
  if (!source.includes("clearInterval(lockHeartbeatId)")) throw new Error("heartbeat sem limpeza");
});

Deno.test("downloads e transcrição respeitam limite de tempo", () => {
  const worker = Deno.readTextFileSync(new URL("../index.ts", import.meta.url));
  const meta = Deno.readTextFileSync(new URL("../../_shared/meta-whatsapp-client.ts", import.meta.url));
  if (!worker.includes("controller.abort(), 25_000")) throw new Error("timeout do worker ausente");
  if (!worker.includes("downloadMetaMedia(mediaId, controller.signal)")) throw new Error("sinal não chegou ao download Meta");
  if (!meta.includes("signal?: AbortSignal") || !meta.includes("signal,")) throw new Error("cliente Meta ignora cancelamento");
});
