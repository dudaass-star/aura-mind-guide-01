# Concluir telemetria e interrupção da conversa web

## Objetivo

Fechar os dois pontos restantes da conversa web na Fase 1: medir a fluidez real sem armazenar conteúdo sensível e garantir que uma nova mensagem interrompa a resposta em andamento sem perder, duplicar ou entregar bolhas fora de contexto.

## Implementação

### 1. Interrupção confiável de turnos

- Ao aceitar qualquer nova mensagem, atualizar imediatamente o identificador do último envio do cliente, mesmo quando outro processamento já estiver ativo.
- Fazer o processamento em andamento detectar essa mudança antes de cada bolha e interromper as bolhas restantes.
- Preservar as partes ainda não entregues como contexto temporário e recompor a resposta usando também a nova mensagem.
- Substituir o retorno passivo de concorrência por uma retomada persistente, para que o navegador possa fechar sem perder o novo turno.
- Garantir que somente o processamento dono do turno possa liberar seu estado, evitando que um processamento antigo encerre o novo.

### 2. Telemetria de latência

- Registrar eventos técnicos por turno, sem texto, áudio, telefone ou outro conteúdo da conversa.
- Medir: toque até bolha local, recebimento no servidor, início de processamento, primeira resposta persistida e conclusão do turno.
- Calcular tempos por etapa a partir de timestamps do cliente e do servidor, vinculados apenas ao identificador técnico da mensagem.
- Permitir consulta de p50, p75, p95, taxa de erro e turnos interrompidos para acompanhar os limites definidos no plano principal.
- Tornar a gravação da telemetria não bloqueante: falha de medição nunca pode atrasar ou impedir a conversa.

### 3. Validação obrigatória

- Testar envio de texto e áudio, histórico e tempo real após as mudanças.
- Enviar uma segunda mensagem durante o processamento e confirmar que nenhuma bolha antiga posterior é entregue.
- Confirmar que a resposta recomposta considera as duas mensagens e que não há duplicidade.
- Repetir com reconexão e fechamento da tela após o envio.
- Verificar no banco os eventos e tempos do turno, sem conteúdo sensível.
- Rodar os testes das funções, validação de tipos e checagem de alterações antes de publicar.

## Critério de conclusão

A Fase 1 só será marcada como concluída quando áudio, telemetria e interrupção tiverem evidência prática de funcionamento, inclusive após reconexão. Em seguida, o trabalho avança para a Fase 2: navegação do aplicativo, conta e instalação na tela inicial.
