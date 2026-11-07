// Textos do winback de cancelados (PT-BR).
export type Stage = 'd3' | 'd14' | 'd30';

// Só o primeiro nome: o nome completo do cadastro soa frio para quem já
// conversou de forma íntima com a AURA.
export function firstName(name: string | null | undefined): string {
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  if (!first) return '';
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

// O texto nunca fala de pagamento ou falha: o foco é o espaço e a relação.
// `_paymentFailed` fica na assinatura para manter os chamadores estáveis.
export function buildMessage(stage: Stage, name: string, link: string, _paymentFailed = false): string {
  const fn = firstName(name);
  const hi = fn ? `Oi, ${fn}. 💜` : 'Oi! 💜';

  if (stage === 'd3') {
    return `${hi}\n\nSenti sua falta esses dias. Como você tá?\n\nSeu espaço e tudo o que a gente conversou continuam guardados aqui com carinho. Quando quiser voltar, é só por aqui:\n👉 ${link}`;
  }

  if (stage === 'd14') {
    return `${hi}\n\nFaz duas semanas que a gente não conversa. Sei que a vida corre, e tá tudo bem.\n\nDeixei uma condição mais leve pra você retomar quando fizer sentido:\n👉 ${link}`;
  }

  return `${hi}\n\nFaz um mês. Não quero insistir, só lembrar que a porta continua aberta e o seu espaço segue guardado.\n\nSe fizer sentido voltar, preparei uma opção mais enxuta:\n👉 ${link}`;
}

