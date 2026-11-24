// Resolve o caminho do arquivo de voz da Aura no bucket privado.
// Prioriza o caminho gravado na mensagem; para mensagens antigas, extrai do link assinado original.
export const TTS_BUCKET = 'aura-tts-audios';

export function ttsPathFromMessage(metadata: unknown, audioUrl: string | null | undefined): string | null {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const path = (metadata as Record<string, unknown>).tts_storage_path;
    if (typeof path === 'string' && path.length > 0) return path;
  }
  if (!audioUrl) return null;
  const marker = `/object/sign/${TTS_BUCKET}/`;
  const index = audioUrl.indexOf(marker);
  if (index < 0) return null;
  const rest = audioUrl.slice(index + marker.length).split('?')[0];
  try { return decodeURIComponent(rest) || null; } catch { return null; }
}
