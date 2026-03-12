
Diagnóstico confirmado: sim, o print bate exatamente com um fluxo automático do backend.

1) O que aconteceu (causa raiz)
- A mensagem do print é gerada pela função `schedule-setup-reminder` (texto idêntico no código).
- Essa função está agendada no cron como `0 */6 * * *` (UTC), ou seja, em horário de Brasília ela roda em:
```text
21:00, 03:00, 09:00, 15:00
```
- Isso explica o padrão do print (21h → 03h → 09h).
- Ela também não tem trava de horário silencioso (22h–7h/8h), então 03h passa normalmente.
- E não existe controle de “já enviei esse lembrete para esse estágio”, então o mesmo usuário pode receber repetido enquanto continuar elegível.

2) Por que nas análises anteriores “não aparecia”
- Essa função envia no WhatsApp, mas não grava essas saídas na tabela `messages`.
- Então consulta só em histórico de mensagens não capturava esse tipo de disparo.

3) Plano de correção (implementação)
- Passo 1 (contenção imediata):
  - Pausar temporariamente o job `schedule-setup-reminder` para interromper disparos enquanto aplicamos correção.
- Passo 2 (corrigir horário):
  - Trocar cron de `0 */6 * * *` para um horário comercial em Brasília (proposta padrão: 1x/dia às 10h BRT).
  - Adicionar guardrail no código: não enviar entre 22h e 7h/8h BRT, mesmo que o cron seja alterado incorretamente no futuro.
- Passo 3 (eliminar duplicidade):
  - Adicionar rastreio de envio por estágio (primeiro lembrete e urgente) no perfil do usuário.
  - Enviar cada estágio no máximo uma vez por ciclo mensal.
  - Resetar esses campos quando iniciar novo ciclo mensal.
- Passo 4 (proteger experiência):
  - Antes de enviar lembrete, bloquear envio se houver:
    - DND ativo,
    - sessão ativa,
    - interação recente,
    - tarefa pendente já combinada com usuário.
- Passo 5 (observabilidade):
  - Registrar esses envios automáticos no histórico interno (`messages`) para auditoria futura.

4) Detalhes técnicos (arquivos/itens a alterar)
- `supabase/functions/schedule-setup-reminder/index.ts`
  - adicionar quiet hours BRT
  - adicionar deduplicação por estágio
  - adicionar filtros de segurança (sessão ativa/interação recente/tarefa pendente)
  - inserir log em `messages`
- `supabase/functions/monthly-schedule-renewal/index.ts`
  - reset dos marcadores de lembrete no início do mês
- `supabase/functions/stripe-webhook/index.ts` (quando reativar necessidade de agendamento)
  - reset dos marcadores para novo ciclo
- Banco (migration)
  - novas colunas de controle de lembrete por estágio em `profiles`
- Cron (SQL operacional)
  - ajustar `schedule` do job `schedule-setup-reminder` para janela diurna BRT

5) Validação após correção
- Verificar cron atualizado.
- Rodar a função em modo de teste e confirmar:
  - 03h BRT => “skipped quiet_hours”
  - usuário elegível recebe no máximo 1 lembrete por estágio
  - envio passa a aparecer em histórico auditável
- Auditoria de 7/30 dias para confirmar zero automações entre 22h e 7h.
