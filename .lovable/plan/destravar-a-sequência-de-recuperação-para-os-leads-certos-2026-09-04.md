# Destravar a sequência de recuperação para os leads certos

Confirmei nos dados dos últimos 14 dias: **106 bloqueios** por regras nossas, sendo a grande maioria por "cap de 30 dias no telefone" (`phone_window_cap`: 106 registros somando os estágios), mais 19 encerramentos por acúmulo de falhas (`max_failures_*`) e 3 por telefone duplicado.

## O que está barrando

1. **Quem responde à Aura é punido.** O limite de 30 dias conta **qualquer** mensagem nossa enviada ao número — inclusive as respostas do agente durante a conversa. Caso real de hoje (Luciana, 11h): recebeu o template de 20 min, clicou em "Ficou uma dúvida", trocou 3 perguntas com o agente e, com isso, acumulou 5 mensagens de saída em 35 minutos — passou a ser tratada como "número já queimado" e ficou fora dos contatos seguintes. É o inverso do que queremos: lead engajada é a mais quente.

2. **Leads fechadas pelo bug do template de 24h.** Entre 21 e 29/08 o 2º contato falhou 13.953 vezes por SID incompleto (já corrigido). Antes da correção, a trava anti-loop encerrou o estágio de vários leads com `max_failures_*`; essas pessoas nunca vão receber o 2º contato, mesmo com o template funcionando agora.

3. **Falha antiga do template do encontro de R$ 6,90** ("Content was not found", 20 casos em 31/08, já resolvida) também fechou estágio de leads que não vão ser reavaliados.

4. **Telefone duplicado** fecha o estágio de todos os checkouts do mesmo número, mesmo quando são tentativas de dias diferentes — e não só o duplo clique que a regra queria cobrir.

## O que fazer

1. **Conversa não conta como contato.** O limite de 30 dias passa a contar apenas as mensagens de campanha (templates proativos) enviadas ao número. Respostas do agente dentro de uma conversa iniciada pelo lead deixam de contar.
2. **Limite mais realista:** 3 templates proativos por número em 30 dias (hoje: 2 mensagens de qualquer tipo).
3. **Conversa ativa pausa, não bane.** Se o lead trocou mensagens com o agente nas últimas 48h, o template do estágio seguinte é adiado, e não descartado para sempre.
4. **Reabrir quem foi fechado por falha nossa.** Zerar o marcador de estágio dos leads dos últimos 30 dias fechados com `phone_window_cap`, `max_failures_*` e as falhas de template já corrigidas, para voltarem à fila (respeitando horário silencioso e as guardas de "já pagou" / "já é cliente").
5. **Duplicado só quando é duplicado.** Fechar irmãos do mesmo telefone apenas quando o outro checkout foi criado nas últimas 6 horas.
6. **Validar sem incomodar ninguém:** rodar a função em simulação, conferir quantos leads voltam à fila e por qual estágio, e depois acompanhar o primeiro ciclo real nos registros.

## Detalhes técnicos

- `supabase/functions/recover-abandoned-checkout-whatsapp/index.ts`
  - Bloco do cap (~linha 180-230): trocar a contagem de `recovery_messages` por contagem restrita a mensagens com `metadata->>'template'` ou `metadata->>'track'` (proativas); `CAP_LIMIT = 3`.
  - Novo conjunto `activeConversationPhones` (inbound em `recovery_messages` nas últimas 48h) → motivo `skipped_soft: conversa_ativa` **sem** marcar `*_sent_at`, para reavaliação na rodada seguinte.
  - `markPhoneSiblings`: adicionar `.gte("created_at", now-6h)` nas duas atualizações.
  - `stageFailureCount`: manter o teto de 3, mas ignorar tentativas cujo erro caia em `INFRA_FAILURE_PATTERNS` (SID/template inválido não deve esgotar o lead).
- Reabertura (via SQL de dados, sem mudança de schema): `UPDATE checkout_sessions` e `asaas_payments` zerando `whatsapp_recovery_*_sent_at` + `whatsapp_recovery_last_error` nas linhas dos últimos 30 dias com erro `skipped: phone_window_cap`, `skipped: max_failures_%` e nas fechadas pelas falhas `Invalid Parameter` / `Content was not found`.
- `AdminEngagement.tsx` → `SKIP_LABELS`: rótulo para o novo motivo de conversa ativa.
- Nenhum envio real durante a verificação (dry-run primeiro).
