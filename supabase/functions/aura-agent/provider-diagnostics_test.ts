import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { providerFailureDiagnostic } from './provider-diagnostics.ts';

const base = { model: 'gemini-3-flash-preview', stage: 'generation' as const, requestId: 'aabbccdd-1122-3344-5566-778899001122', elapsedMs: 2134.4 };

Deno.test('classifica 503 sem expor mensagem, prompt, chave ou detalhes arbitrários', () => {
  const result = providerFailureDiagnostic({ ...base, status: 503, body: JSON.stringify({ error: { status: 'UNAVAILABLE', message: 'Model overloaded: segredo-cliente', details: [{ key: 'chave-privada' }] }, prompt: 'conteudo-terapeutico' }) });
  assertEquals(result.reason, 'provider_overloaded');
  assertEquals(result.provider_status, 'UNAVAILABLE');
  assertEquals(result.http_status, 503);
  assertEquals(result.elapsed_ms, 2134);
  for (const forbidden of ['segredo-cliente', 'chave-privada', 'conteudo-terapeutico']) assertEquals(JSON.stringify(result).includes(forbidden), false);
});

Deno.test('não inventa causa para 503 sem explicação', () => {
  const result = providerFailureDiagnostic({ ...base, status: 503, body: '<html>erro desconhecido</html>' });
  assertEquals(result.reason, 'unknown');
  assertEquals(result.provider_status, null);
});

Deno.test('separa falha de transporte e cancelamento de erro do provedor', () => {
  assertEquals(providerFailureDiagnostic({ ...base, errorName: 'TypeError' }).reason, 'transport_failure');
  assertEquals(providerFailureDiagnostic({ ...base, errorName: 'AbortError' }).reason, 'request_aborted');
  assertEquals(providerFailureDiagnostic({ ...base, status: 429, body: '{"error":{"status":"RESOURCE_EXHAUSTED","message":"Quota exceeded"}}' }).reason, 'quota_or_rate_limit');
});

Deno.test('rejeita valores não permitidos em campos técnicos', () => {
  const result = providerFailureDiagnostic({ ...base, model: 'email@cliente.com', requestId: 'segredo', status: 500, body: '{"error":{"status":"dados privados"}}' });
  assertEquals(result.model, 'unknown');
  assertEquals(result.request_id, null);
  assertEquals(result.provider_status, null);
});