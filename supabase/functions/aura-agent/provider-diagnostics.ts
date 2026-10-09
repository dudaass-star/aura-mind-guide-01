// Não registra corpo bruto, mensagens, cabeçalhos de autorização ou identificadores pessoais.
export function providerFailureDiagnostic(input: {
  model: string;
  stage: 'generation' | 'cache_fallback';
  requestId: string;
  elapsedMs: number;
  status?: number;
  body?: string;
  errorName?: string;
}) {
  let providerStatus: string | null = null;
  let reason = 'unknown';
  try {
    const parsed = JSON.parse(input.body ?? '{}');
    const error = parsed?.error;
    const allowedStatuses = ['UNAVAILABLE', 'RESOURCE_EXHAUSTED', 'DEADLINE_EXCEEDED', 'INTERNAL', 'INVALID_ARGUMENT', 'PERMISSION_DENIED', 'UNAUTHENTICATED', 'NOT_FOUND', 'FAILED_PRECONDITION'];
    if (allowedStatuses.includes(error?.status)) providerStatus = error.status;
    // A mensagem serve apenas para classificar; nunca é incluída no registro.
    const message = typeof error?.message === 'string' ? error.message : '';
    if (/overload|high demand|capacity|busy/i.test(message)) reason = 'provider_overloaded';
    else if (/quota|rate limit|resource exhausted/i.test(message)) reason = 'quota_or_rate_limit';
    else if (/unavailable/i.test(message)) reason = 'provider_unavailable';
    else if (/deadline|timed? out|timeout/i.test(message)) reason = 'provider_deadline';
  } catch {
    // Respostas não JSON continuam úteis pelo status HTTP, sem persistir seu conteúdo.
  }
  if (!input.status) reason = input.errorName === 'AbortError' ? 'request_aborted' : 'transport_failure';
  return {
    event: 'aura_provider_failure_v1',
    at_brt: new Date().toISOString().replace('Z', '+00:00'),
    provider: 'google_native',
    model: /^[a-zA-Z0-9._-]{1,80}$/.test(input.model) ? input.model : 'unknown',
    stage: input.stage,
    request_id: /^[a-f0-9-]{36}$/i.test(input.requestId) ? input.requestId : null,
    elapsed_ms: Number.isFinite(input.elapsedMs) ? Math.max(0, Math.round(input.elapsedMs)) : null,
    http_status: input.status ?? null,
    provider_status: providerStatus,
    reason,
  };
}