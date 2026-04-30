
# Plano de correção — 2 bugs independentes

## Bug 1 — Remarcação de sessão sem efeito no banco

### Causa-raiz
O handler em `aura-agent/index.ts` (linha 6042-6075) já existe e funciona corretamente: quando a resposta da IA contém a tag `[REAGENDAR_SESSAO:YYYY-MM-DD HH:MM]`, ele atualiza `sessions.scheduled_at` e reseta os flags de lembrete.

O problema é que **o prompt nunca ensina a IA a emitir essa tag**. Na seção `# SESSÕES` (linha 2724-2729) o prompt diz apenas:

> *"Quando o usuário quiser agendar, reagendar ou cancelar uma sessão, confirme naturalmente com data e horário. O sistema extrai a intenção da sua resposta e executa a ação no banco de dados."*

Isso é falso — não há extrator NLP rodando depois da resposta; só o regex literal. Resultado: a Aura confirma "Já mudei pra quinta 22h" mas **nada é gravado**. Mesmo bug provavelmente atinge `[AGENDAR_SESSAO:...]` (criação de novas sessões pedidas pelo usuário em conversa).

### Correção
Editar a seção `# SESSÕES` do prompt em `aura-agent/index.ts` (~linha 2724) para tornar as tags **obrigatórias e explícitas**, no mesmo padrão das outras tags internas que já funcionam (`[MARCO:...]`, `[REAGENDAR_SESSAO:...]` no removeInternalTags).

Conteúdo a adicionar ao prompt:

- Lista clara das 2 tags: `[REAGENDAR_SESSAO:YYYY-MM-DD HH:MM]` e `[AGENDAR_SESSAO:YYYY-MM-DD HH:MM]`.
- Regra: SEMPRE que confirmar uma data/hora nova com o usuário, anexar a tag correspondente ao final da mensagem.
- Exemplos curtos de uso (com e sem a tag, mostrando que sem ela nada acontece).
- Conversão de "amanhã às 22h" / "quinta 22h" para data absoluta usando o timestamp de hoje (já injetado no contexto).
- Reforçar que cancelamento usa `[SESSAO_PERDIDA_RECUSADA]` (tag que já existe).

Sem mudanças de código no handler — ele já está correto.

### Validação
- Após o deploy, verificar nos logs do `aura-agent` por `📅 Session rescheduled via AURA` em conversas reais.
- Como teste manual, simular o fluxo da Larissa: pedido de remarcação → checar se a próxima sessão `scheduled` muda de horário.

---

## Bug 2 — Cron `weekly-report-sunday-10am-brt` (jobid 35) nunca disparou

### Causa-raiz
O job está cadastrado em `cron.job` com `active=true`, schedule `0 13 * * 0` (domingo 13h UTC = 10h BRT) e `command` SQL bem formado e idêntico ao do jobid 23 (mensal, que funciona). Mesmo assim `cron.job_run_details` mostra **0 execuções** desde a criação (27/04/2026, jobid 35). Outros jobs do mesmo período rodaram normalmente.

Esse padrão (job ativo, schedule válido, comando válido, zero runs) é típico de jobs que ficaram em estado inconsistente no pg_cron — geralmente após criação durante uma janela onde o worker do pg_cron não recarregou o catálogo. Solução padrão: remover e recriar.

### Correção
Via tool de DB insert (não migration, pois contém anon key específico do projeto, conforme regra de cron jobs):

```sql
SELECT cron.unschedule(35);

SELECT cron.schedule(
  'weekly-report-sunday-10am-brt',
  '0 13 * * 0',
  $$
  SELECT net.http_post(
    url := 'https://uhyogifgmutfmbyhzzyo.supabase.co/functions/v1/weekly-report',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY>"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

### Validação
- Após recriar, consultar `cron.job` para confirmar novo `jobid` e `active=true`.
- No próximo domingo 10h BRT, conferir `cron.job_run_details` e logs da edge function `weekly-report`.
- Para não esperar uma semana, disparar 1 execução manual agora via `supabase.functions.invoke('weekly-report', { body: {} })` para validar a função em si — separado da validação do cron.

---

## Ordem de execução

1. Editar prompt do `aura-agent/index.ts` (Bug 1).
2. Recriar cron jobid 35 (Bug 2).
3. Disparo manual de teste do `weekly-report` para confirmar que a função em si está saudável.
4. Atualizar memória `mem://features/whatsapp/session-reminder-flow` (ou criar uma nova memória) registrando que tags `[AGENDAR_SESSAO]` e `[REAGENDAR_SESSAO]` são o único caminho de gravação — para evitar regressão futura.

## Fora de escopo (conforme pedido)
- Não criar manualmente sessão remarcada para a Larissa.
- Não disparar weekly-report retroativo dela.
