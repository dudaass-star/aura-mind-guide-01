# Hoje como direção diária

## Objetivo

Transformar **Hoje** no lugar que ajuda o cliente a reconhecer rapidamente o que merece atenção e continuar sua experiência na Olá Aura. A tela deixa de ser uma sequência fixa de cartões e passa a priorizar uma ação útil conforme o momento real da pessoa.

## Experiência proposta

1. **Agora**
   - Exibir uma única prioridade principal.
   - Ordem: sessão em andamento ou próxima da hora; preparação de sessão ainda vazia; episódio novo da jornada; continuidade do último encontro; conversa livre.
   - Levar diretamente à ação correta, sem mandar o cliente resolver pela conversa quando já existe uma tela própria.

2. **Continuar de onde parou**
   - Reunir somente os próximos passos realmente disponíveis: próxima sessão, episódio liberado ou ponto deixado pela última sessão.
   - Evitar repetir o mesmo conteúdo em cartões diferentes.

3. **Um convite leve para hoje**
   - Manter a pergunta do dia quando não houver conversa recente.
   - Sugerir meditação apenas como alternativa contextual, nunca como primeira solução automática.
   - Integrar uma leitura recente do Percurso como hipótese verificável, sem criar uma área separada chamada Insights.

4. **Estados diferentes para momentos diferentes**
   - Primeiro acesso: uma entrada simples para conversar com a AURA.
   - Cliente sem ação pendente: convite direto e leve para conversar.
   - Sessão próxima: horário, entrada direta e preparação visível.
   - Jornada ativa: abrir o episódio mais recente disponível.
   - Pós-sessão: retomar o fechamento ou conferir uma leitura possível.

5. **Medição útil**
   - Registrar abertura de Hoje, prioridade apresentada, ação iniciada e retorno concluído.
   - Separar retorno para conversa, sessão, jornada e pausa para avaliar hábito, retenção e impacto no uso do plano.
   - Não aumentar a frequência de mensagens ou notificações nesta etapa.

## Ajustes de coerência

- Remover atalhos antigos de reagendamento por conversa; a agenda continuará sendo gerida em Sessões.
- Corrigir a saudação para usar sempre o horário de Brasília.
- Evitar capitalização artificial de temas e datas.
- Usar os componentes e cores atuais do aplicativo, com uma hierarquia mais clara e sem cartões dentro de cartões.
- Manter Percurso como parte integrada da Olá Aura; não abrir uma frente independente de “Insights”.

## Validação

- Simular primeiro acesso, cliente ativo sem pendências, sessão futura, sessão prestes a começar, sessão em andamento, pós-sessão e jornada ativa.
- Confirmar que cada estado apresenta apenas uma prioridade principal e que todos os destinos abrem corretamente.
- Validar celular pequeno, iPhone, Android e desktop, incluindo textos longos e ausência parcial de dados.
- Conferir isolamento entre clientes, ausência de duplicidade nas métricas e nenhum desvio para WhatsApp.

## Detalhes técnicos

- Consolidar os dados necessários da tela Hoje em consultas paralelas e estáveis.
- Reaproveitar as ações seguras já existentes de Sessões, Conversa, Jornadas, Meditações e Percurso.
- Adicionar eventos de valor idempotentes com contexto da prioridade exibida e do destino escolhido.
- Não alterar regras de cota, lembretes, pagamentos, sessões ou geração de conteúdo.