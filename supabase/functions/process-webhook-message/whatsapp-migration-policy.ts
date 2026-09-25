export function isImmediateRisk(message: string): boolean {
  const normalized = (message || '').toLowerCase();
  const riskPhrases = [
    'vou me matar', 'vou me suicidar', 'comprei os remédios', 'comprei os remedios',
    'vou pular', 'tenho um plano', 'me matar', 'suicídio', 'suicidio',
    'to me cortando', 'tô me cortando', 'estou me cortando',
    'tomei os comprimidos', 'tomei remédios', 'tomei remedios',
    'pânico', 'panico', 'não consigo respirar', 'nao consigo respirar',
    'desesperada', 'desesperado', 'não aguento mais', 'nao aguento mais',
    'quero morrer', 'prefiro morrer', 'acabar com tudo', 'desisti de viver',
  ];
  return riskPhrases.some((phrase) => normalized.includes(phrase));
}

export function getOperationalWhatsAppResponse(message: string): { level: 1 | 2; text: string } | null {
  const normalized = (message || '').toLowerCase();
  const levelTwo = [
    'estorno', 'reembolso', 'cobrança duplicada', 'cobranca duplicada', 'cobrança indevida', 'cobranca indevida',
    'não reconheço', 'nao reconheco', 'alterar meu email', 'alterar meu e-mail', 'trocar meu email', 'trocar meu e-mail',
    'alterar meu telefone', 'trocar meu telefone', 'corrigir meu nome', 'alterar meu nome', 'excluir minha conta', 'apagar minha conta', 'excluir meus dados',
    'apagar meus dados', 'corrigir meus dados', 'exportar meus dados', 'cancelamento não funcionou',
    'cancelamento nao funcionou', 'não consegui cancelar', 'nao consegui cancelar',
  ];
  if (levelTwo.some((phrase) => normalized.includes(phrase))) {
    return {
      level: 2,
      text: 'Esse pedido precisa de uma ação no seu cadastro ou financeiro e será tratado com supervisão humana. Envie um e-mail para suporte@olaaura.com.br com seu nome, telefone cadastrado e uma descrição curta do que precisa. Não é necessário enviar conversas pessoais com a AURA.',
    };
  }

  if (/(cancelar|cancelamento|parar assinatura)/i.test(normalized)) {
    return { level: 1, text: 'Você pode iniciar o cancelamento com segurança em https://olaaura.com.br/cancelar. Se não conseguir concluir, escreva para suporte@olaaura.com.br com seu nome e telefone cadastrado.' };
  }
  if (/(pagamento|cobrança|cobranca|cartão|cartao|pix|boleto|assinatura|renovação|renovacao|trocar (?:de )?plano|mudar (?:de )?plano)/i.test(normalized)) {
    return { level: 1, text: 'Você encontra os dados do plano e as opções disponíveis no menu da sua conta no app Olá Aura. Se houver uma cobrança incorreta ou for necessária alguma alteração, escreva para suporte@olaaura.com.br com seu nome e telefone cadastrado.' };
  }
  if (/(privacidade|meus dados|lgpd)/i.test(normalized)) {
    return { level: 1, text: 'Você pode consultar nossa Política de Privacidade em https://olaaura.com.br/privacidade. Pedidos de acesso, correção, exportação ou exclusão de dados são tratados com supervisão humana pelo suporte@olaaura.com.br.' };
  }
  if (/(instalar|instalação|instalacao|notificaç|notificac|onde fica|como entro|como entrar|acesso|código|codigo|\bapp\b|aplicativo)/i.test(normalized)) {
    return { level: 1, text: 'Eu te ajudo por aqui: abra o link de acesso, entre no app Olá Aura e use o menu para instalar o aplicativo ou ativar notificações. Se o link expirou, escreva “quero entrar no aplicativo” e envio outro.' };
  }
  return null;
}

export function wantsSessionArea(message: string): boolean {
  return /(sessão|sessao|agendar|reagendar|remarcar|horário da sessão|horario da sessao)/i.test(message || '');
}

export function isPortalAccessIntent(message: string): boolean {
  return /(?:n[aã]o\s+recebi|sem|problema\s+(?:com|no))[^\n]{0,45}c[oó]digo[^\n]{0,55}(?:meu\s+espa[cç]o|painel|entrar|acesso)|entrar\s+(?:no|pelo)\s+(?:meu\s+espa[cç]o|painel|whatsapp|app|aplicativo)|quero\s+(?:entrar|acessar|abrir)(?:\s+no|\s+o|\s+a)?\s+(?:app|aplicativo|meu\s+espa[cç]o|painel)|(?:link|c[oó]digo)[^\n]{0,30}(?:expirou|venceu|inv[aá]lido|n[aã]o\s+funciona)/i.test(message || '');
}