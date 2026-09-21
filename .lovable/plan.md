# Personalização de notificações orientada a LTV

## Objetivo
Fazer cada aviso chegar no contexto e horário com maior chance de retorno útil, sem aumentar a frequência atual, sem expor conteúdo íntimo e sem substituir comunicações críticas.

O primeiro foco será o cliente do Plano Semanal, que geralmente ainda tem pouco histórico. A personalização precisa gerar valor desde o primeiro dia e ajudar a provar continuidade antes da renovação.

## O que será construído
- Criar um perfil de comunicação por cliente com estágio atual, horários de uso observados, preferência explícita, canais disponíveis e sinais recentes de interação.
- Nos primeiros sete dias, usar sinais de alta disponibilidade: objetivo declarado, plano, onboarding, horário de entrada, primeira conversa, sessão agendada/concluída, conteúdo aberto e respostas ou avisos ignorados.
- Calcular o melhor horário a partir do comportamento real do próprio cliente; enquanto houver poucos dados, usar o horário escolhido no onboarding, o horário da compra/primeiro uso e faixas seguras por tipo de aviso.
- Escolher apenas uma comunicação elegível por janela, priorizando: resposta aguardada, sessão, jornada/prática e resumo.
- Personalizar somente com variáveis seguras: primeiro nome, tipo de conteúdo disponível, proximidade da sessão e estágio amplo da jornada.
- Manter textos da tela bloqueada discretos, sem tema emocional, diagnóstico, transcrição, cobrança específica ou texto livre criado por IA.
- Preservar os limites atuais: deduplicação, silêncio noturno, app aberto, expiração, opt-out e fallback para WhatsApp quando aplicável.
- Adiar avisos não urgentes até o melhor horário; lembretes de sessão continuam obedecendo o horário real da sessão.
- Registrar por entrega a regra usada, horário escolhido e resultado para medir retorno útil e retenção.

## Regras de frequência
- A personalização nunca cria uma nova oportunidade de envio; ela apenas seleciona, prioriza, adia ou suprime avisos que já seriam enviados.
- No máximo um aviso não urgente por cliente na mesma janela diária.
- Avisos concorrentes são fundidos: fica apenas o de maior valor naquele momento.
- Recusa, desativação e preferências do cliente sempre prevalecem.
- A primeira semana terá uma cadência fixa máxima; novos sinais mudam conteúdo e horário, nunca acrescentam disparos.

## Medição de impacto
- Medir abertura, retorno ao aplicativo, início/continuidade de conversa, sessão, jornada e prática.
- Comparar clientes com horário personalizado versus regra atual em uma janela controlada de 7–14 dias.
- Medir separadamente ativação D0, primeira conversa, primeira sessão, retorno D1/D3/D6 e conversão Semanal → Mensal.
- Acompanhar retenção e receita por cliente em janelas posteriores, sem atribuir LTV apenas ao último clique.
- Incluir chave de reversão por categoria para interromper rapidamente qualquer comportamento indesejado.

## Implementação técnica
- Adicionar preferências e perfil calculado de comunicação com acesso protegido.
- Criar um avaliador determinístico compartilhado pelo roteador; nenhuma decisão de frequência dependerá de IA.
- Criar uma trilha específica de início com estados objetivos: entrou, conversou, marcou sessão, concluiu sessão, retornou e chegou à oferta mensal.
- Evoluir o roteador para aplicar prioridade, melhor horário, supressão e metadados de decisão antes de escolher push ou WhatsApp.
- Integrar primeiro respostas, sessões, jornadas e resumos já migrados; manter cobrança e segurança fora desta personalização.
- Validar tipos, funções, deduplicação, silêncio, múltiplos aparelhos e reprocessamento antes de publicar.

## Resultado esperado
Menos avisos irrelevantes, mais retornos em momentos úteis e maior continuidade de uso — principal mecanismo esperado de aumento de LTV — sem elevar pressão ou volume sobre o cliente.
