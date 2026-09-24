# Primeiros 14 dias: condução por Hoje + push

## Objetivo
Levar cada novo cliente a perceber duas ou três formas reais de valor nos primeiros 14 dias, sem tutorial, checklist ou interferência dentro da conversa com a AURA.

## Experiência do cliente
- O **Hoje** apresenta apenas uma direção principal por vez, escolhida por prioridade e pelo que a pessoa realmente já fez.
- O **push** reforça essa mesma direção quando o cliente não abriu o aplicativo, sem criar uma segunda recomendação concorrente.
- Cada aviso abre diretamente a tela ou ação correspondente.
- O chat permanece protegido: nenhum convite dos 14 dias aparece durante uma conversa.

## Árvore de condução
1. **Começo:** enquanto ainda não houve conversa, priorizar o primeiro contato com a AURA.
2. **Primeiro retorno:** após uma conversa útil, favorecer retorno ao Hoje sem inserir convite no chat.
3. **Segundo valor:** apresentar uma única experiência ainda não vivida, escolhendo entre Jornada, Sessão e prática conforme elegibilidade e sinais concretos.
4. **Continuidade:** se houver sessão próxima, preparação pendente ou episódio liberado, isso prevalece sobre descoberta de funções.
5. **Valor acumulado:** após duas experiências, mostrar continuidade construída ou Percurso, sem afirmar evolução não comprovada.
6. **Dia 14:** encerrar a condução inicial automaticamente; o cliente passa às regras normais de retenção.

## Regras de segurança e frequência
- Nunca gerar convites dentro do chat nem alterar as respostas da AURA.
- No máximo um push não urgente por dia e três durante toda a condução inicial.
- Não enviar entre 22h e 08h BRT; programar para o horário apropriado seguinte.
- Não enviar se o aplicativo estiver aberto, se a ação já foi feita, se houver sessão prioritária ou se outra entrega não urgente já estiver prevista.
- Sem fallback para WhatsApp neste bloco: a condução inicial será exclusivamente app + push.
- Deduplicar cada marco e cancelar recomendações vencidas quando o comportamento mudar.
- Usar textos discretos e sem conteúdo emocional ou psicológico na tela bloqueada.

## Implementação
- Criar uma fonte única de decisão para calcular: dia de entrada, experiências vividas, prioridade atual, destino, motivo verificável e elegibilidade do push.
- Fazer o Hoje consumir essa decisão, preservando os estados prioritários já existentes de sessão e Jornada.
- Executar diariamente a avaliação dos clientes em D0–D14 e encaminhar avisos pelo roteador de notificações existente.
- Registrar apresentação, abertura, envio, clique e conclusão por marco, mantendo atribuição entre push e ação realizada.
- Remover o cartão de descoberta de dentro da conversa, caso ainda esteja ativo, sem remover acessos manuais às áreas.

## Validação
- Testar cada faixa de dia e combinação principal de uso, incluindo conta sem conversa, sessão próxima, preparação pendente, episódio pendente e duas experiências concluídas.
- Simular mudança de estado entre agendamento e entrega para garantir que um aviso vencido não seja enviado.
- Confirmar deduplicação, limite total, silêncio BRT, aplicativo aberto, ausência de aparelho e token inválido.
- Simular os links de push e o Hoje em celular e desktop, sem erros e sem qualquer convite aparecendo no chat.
- Limpar todos os dados temporários de teste e só considerar o bloco concluído após validação técnica e visual.

## Critérios de sucesso do piloto
- Ativação em D0 e retorno em D1, D3, D7 e D14.
- Percentual que experimenta duas ou mais formas de valor.
- Abertura e conclusão por recomendação do Hoje e por push.
- Primeira sessão, episódio consumido e prática realizada.
- Opt-out, bloqueio e excesso de notificações.
- Retenção e permanência comparadas por coorte, sem atribuir causalidade antes de haver volume suficiente.
