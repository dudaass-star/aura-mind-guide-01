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

Deno.test("falha anterior encerra o lote acumulado", () => {
  assert(SOURCE.includes(".eq('status', 'failed')"));
  assert(SOURCE.includes("latestFailedTurn?.server_received_at"));
  assert(SOURCE.includes("accumulationBoundary"));
});

Deno.test("falha na segunda geração não derruba a resposta pronta", () => {
  assert(SOURCE.includes("preservando resposta pronta e retomando a fala mais recente"));
  assert(SOURCE.includes("shouldResumeInterruptedTurn = true"));
});

Deno.test("mensagem original é encerrada quando uma fala nova assume o turno", () => {
  assert(SOURCE.includes("originatingMessageId"));
  assert(SOURCE.includes("superseded_by_newer_message"));
});

Deno.test("lote acumulado passa a ser controlado pela mensagem mais recente", () => {
  assert(SOURCE.includes("latestAccumulatedMessage"));
  assert(SOURCE.includes("latestAccumulatedMessage?.client_message_id"));
  assert(SOURCE.includes(".update({ last_user_message_id: currentMessageId })"));
});

Deno.test("erro libera trava e descarta contexto pendente defeituoso", () => {
  assert(SOURCE.includes("pending_content: null"));
  assert(SOURCE.includes("pending_context: null"));
  assert(SOURCE.includes("pending_expires_at: null"));
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

Deno.test("conversa livre no WhatsApp é preservada e redirecionada ao aplicativo", () => {
  assert(SOURCE.includes("'payment_failed', 'canceling', 'taster'"));
  assert(SOURCE.includes("whatsapp_app_migration_sent_at"));
  assert(SOURCE.includes("message_variant: firstMigration ? 'app_migration' : 'app_redirect'"));
  assert(SOURCE.includes("persistirMensagemRecebidaWhatsapp"));
  assert(SOURCE.includes("action: firstMigration ? 'app_migration_sent' : 'app_redirect_sent'"));
});

Deno.test("risco permanece no WhatsApp e suporte operacional não chega ao agente", () => {
  assert(SOURCE.includes("isImmediateRisk(messageText || '')"));
  assert(SOURCE.includes("getOperationalWhatsAppResponse(messageText)"));
  assert(SOURCE.includes("operational_support_level_"));
});

Deno.test("redirecionamento repetido respeita limite de 24 horas", () => {
  assert(SOURCE.includes("whatsapp_app_redirect_last_sent_at"));
  assert(SOURCE.includes("24 * 60 * 60 * 1000"));
  assert(SOURCE.includes("action: 'app_redirect_rate_limited'"));
});

Deno.test("pedido de novo acesso reconhece frases prometidas ao cliente", () => {
  assert(SOURCE.includes("isPortalAccessIntent(messageText || '')"));
  assert(SOURCE.includes("destination: 'conversar'"));
});

Deno.test("áudio sem transcrição e imagem sem legenda também ficam no aplicativo", () => {
  assert(SOURCE.includes("const hasWhatsappContent = !isInApp"));
  assert(SOURCE.includes("'[Áudio recebido no WhatsApp]'"));
  assert(SOURCE.includes("'[Imagem recebida no WhatsApp]'"));
  assert(SOURCE.includes("if (hasWhatsappContent && activeForApp"));
});
Deno.test("heartbeat mantém a trava ativa enquanto o dono processa", () => {
  if (!SOURCE.includes("setInterval(() =>")) throw new Error("heartbeat ausente");
  if (!SOURCE.includes(".eq('owner_token', turnOwnerToken)")) throw new Error("heartbeat sem proteção do dono");
  if (!SOURCE.includes("clearInterval(lockHeartbeatId)")) throw new Error("heartbeat sem limpeza");
});

Deno.test("downloads e transcrição respeitam limite de tempo", () => {
  const meta = Deno.readTextFileSync(new URL("../_shared/meta-whatsapp-client.ts", import.meta.url));
  if (!SOURCE.includes("controller.abort(), 25_000")) throw new Error("timeout do worker ausente");
  if (!SOURCE.includes("downloadMetaMedia(mediaId, controller.signal)")) throw new Error("sinal não chegou ao download Meta");
  if (!meta.includes("signal?: AbortSignal") || !meta.includes("signal,")) throw new Error("cliente Meta ignora cancelamento");
});
