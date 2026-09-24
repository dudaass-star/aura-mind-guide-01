# Hoje como orquestrador definitivo do App

## Resultado esperado

Ao abrir o Hoje, o cliente entende imediatamente o que faz mais sentido agora. A tela apresenta uma direção principal e, quando necessário, apenas uma continuidade secundária discreta.

## O que será feito

1. **Uma única decisão confiável**
   - Centralizar a hierarquia entre sessão urgente, preparação próxima, episódio pendente, condução dos 14 dias, retomada e conversa livre.
   - Usar a mesma regra no Hoje e no push, evitando recomendações diferentes.
   - Não recomendar nada com dados incompletos; atualizar e tentar novamente.

2. **Prioridades mais precisas**
   - Mostrar preparação apenas perto da sessão.
   - Recomendar somente episódios realmente liberados e ainda não concluídos.
   - Priorizar retomada do que já foi iniciado antes de apresentar algo novo.
   - Rotacionar a pergunta diária pelo calendário de Brasília.

3. **Tela mais seletiva**
   - Manter uma ação principal.
   - Exibir no máximo uma continuidade secundária.
   - Evitar que pergunta, prática, Percurso, perfil e push disputem atenção simultaneamente.
   - Apresentar a ativação de notificações em momento oportuno, sem esconder a direção do dia.

4. **Atualização depois da ação**
   - Atualizar o Hoje após conversa, áudio, preparação, sessão, episódio, prática ou abertura do Percurso.
   - Preservar o que o cliente estava vendo enquanto a próxima direção é recalculada.

5. **Medição completa**
   - Medir direção apresentada, aberta, iniciada e concluída.
   - Identificar recomendações repetidamente ignoradas e evitar insistência automática.
   - Preparar dados para avaliar retorno D1, D7 e D14 e impacto por tipo de direção.

## Validação

- Simular cliente novo, sessão próxima, sessão distante, episódio pendente, episódio concluído, cliente recorrente e falha temporária de leitura.
- Verificar celular e computador, links, atualização após conclusão e alinhamento entre Hoje e push.
- Executar testes, revisar segurança e remover todos os dados temporários.

## Limites deste bloco

- Nenhuma nova área, gamificação ou interferência no chat.
- A validação de recebimento de push com o app fechado em Android e iPhone físicos permanece no bloco específico de push.
