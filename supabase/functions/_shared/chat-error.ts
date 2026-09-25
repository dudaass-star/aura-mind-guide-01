// Mantém os detalhes operacionais úteis de erros lançados como objetos pelo cliente de dados.
export function describeChatError(error: unknown): { message: string; code: string | null; status: number | null; stack: string | null } {
  if (!error || typeof error !== 'object') {
    return { message: String(error), code: null, status: null, stack: null };
  }
  const value = error as Record<string, unknown>;
  const code = typeof value.code === 'string' ? value.code : null;
  const status = typeof value.status === 'number' ? value.status : null;
  const details = typeof value.details === 'string' ? value.details : null;
  const hint = typeof value.hint === 'string' ? value.hint : null;
  const message = typeof value.message === 'string' && value.message.trim()
    ? value.message
    : error instanceof Error ? error.message : 'Erro interno sem mensagem';
  return {
    message: [message, code && `código: ${code}`, details && `detalhes: ${details}`, hint && `dica: ${hint}`].filter(Boolean).join(' | '),
    code,
    status,
    stack: error instanceof Error ? error.stack ?? null : null,
  };
}

export function shouldRecoverChatTurn(error: unknown, attempt: number, alreadyAnswered: boolean): boolean {
  if (alreadyAnswered || attempt >= 2) return false;
  const described = describeChatError(error);
  const agentStatus = Number(described.message.match(/Agent HTTP (\d{3})/)?.[1]);
  const status = Number.isFinite(agentStatus) && agentStatus > 0 ? agentStatus : described.status;
  return status === null || status === 429 || status >= 500;
}