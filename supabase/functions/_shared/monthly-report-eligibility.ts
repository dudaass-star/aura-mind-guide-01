// Capítulo do mês só é gerado e avisado quando houve conteúdo real: 1 sessão concluída ou 10 mensagens.
export function hasMonthlySubstance(m: { sessions: number; messages: number }) {
  return m.sessions >= 1 || m.messages >= 10;
}
