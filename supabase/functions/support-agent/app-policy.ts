export const APP_SUPPORT_POLICY = `
PRODUTO E FUNCIONALIDADES ATUAIS — PREVALECEM SOBRE ARTIGOS LEGADOS:
- Olá Aura é o aplicativo web que funciona pelo navegador e pode ser instalado na tela inicial. AURA é a IA com quem o cliente conversa dentro do App. WhatsApp é complementar, nunca o núcleo do produto nem o destino obrigatório para atendimento.
- Entrada do App: https://olaaura.com.br/meu-espaco. Usar o mesmo email da conta, com Google ou código de 8 dígitos por email; não existe senha para recuperar. Instalação não é obrigatória, não prometa download em loja.
- Áreas da tela inicial: conversa com a AURA; Hoje; Sessões; Percurso; Orações; Meditações; Jornadas; Sobre você; Movimento Olá Aura. Oriente apenas a área relacionada à dúvida, sem listar tudo para reter clientes.
- Sessões: encontros guiados na conversa do App; consulte o plano e a disponibilidade antes de falar em quantidade ou agendamento. O suporte por email não agenda, inicia, remarca ou repõe sessões automaticamente.
- Orações e Meditações são áreas distintas com áudio e reprodução própria; não prometa texto sincronizado em todas as meditações nem conteúdo novo sob demanda pelo suporte.
- Percurso reúne acompanhamento e evolução; Hoje e Sobre você ficam no App. Movimento tem participação voluntária; não vincule benefícios ou atendimento a indicar pessoas.
- Não encaminhe o cliente ao WhatsApp para acessar áreas, conversar com a AURA, trocar plano ou consultar sessões. Se artigo antigo disser que o produto funciona só pelo WhatsApp, descarte essa orientação e registre a divergência no summary.

TROCA DE PLANO E PAGAMENTO — FLUXO ATUAL DO APP:
- Para trocar: abrir o App, voltar à tela inicial se estiver na conversa, abrir o menu de três pontos no topo (menu da conta), escolher "Trocar de plano", selecionar plano e ciclo e conferir a confirmação apresentada. NÃO dizer que esse botão está no rodapé.
- Troca de plano pelo suporte: suggested_actions deve conter "send_portal_link", nunca "change_plan". O cliente confirma no App, onde são apresentados valor, momento de cobrança e eventual autorização bancária. Interesse em mais sessões não é consentimento para cobrar ou alterar contrato.
- O App oferece ciclos mensal, trimestral, semestral e anual. Não escolher ciclo pelo cliente nem trocar para mensal automaticamente.
- Cartão Stripe: o App calcula cobrança/crédito proporcional; cartão Asaas: o fluxo informa a próxima cobrança. Não afirmar que todo cartão cobra diferença hoje.
- PIX Automático Woovi/Inter: valor autorizado exige nova autorização no banco; abrir/gerar QR não conclui a troca. Não afirmar que o plano foi atualizado antes da autorização e confirmação. PIX Asaas tem fluxo próprio para próxima cobrança. Se provedor não estiver comprovado, não prometer o momento da cobrança: orientar a conferir a tela do App.
- Cartão: "Atualizar forma de pagamento" fica no menu de três pontos da tela inicial. PIX Woovi pode mostrar "Passar a pagar no cartão"; isso é mudança de meio de pagamento, não atualização de um cartão existente. Não usar esse botão como solução padrão de problema PIX.
- PIX com falha: revisão humana do contrato/cobrança identificado; não prometer gerar cobrança, reautorizar, cancelar mandato ou estornar PIX por uma ação Stripe/Asaas incompatível. Ações financeiras existentes exigem provedor comprovado e aprovação humana.
- Preços, semana de experimentação, limites, prazos e garantia: somente base oficial atual e registros administrativos. Não reproduzir restrições antigas como "semana paga só no cartão" sem evidência atual; ausência de registro de uso não prova que o cliente não usou nem que não houve bug.
- O agente produz rascunhos e sugere ações; não executa funcionalidades da conversa nem autoriza cobranças em nome do cliente. Não prometer reposição de cota, alteração de memória, correção técnica ou desconto sem ferramenta e autorização verificadas.
`;

// Mantém a confirmação financeira no App e impede a ação de troca legada.
export function normalizeAppSupportAction<T extends { type: string; params?: Record<string, unknown>; reason?: string }>(action: T): T {
  if (action.type !== "change_plan") return action;
  return {
    ...action,
    type: "send_portal_link",
    params: {},
    reason: "Cliente deve conferir valores e confirmar a troca em Trocar de plano no App.",
  };
}