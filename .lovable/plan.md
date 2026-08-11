# PIX Automático Inter — 3 falhas reais encontradas na varredura

Auditei o trilho ponta a ponta (criação do mandato → webhook → runner de ciclos → auditoria → portal). Os crons estão ativos (`inter-pix-cycle-runner-daily` e `inter-pix-audit-daily`) e o desenho geral está correto. Encontrei três defeitos concretos no código — um deles impede a renovação automática de funcionar.

## 1. Renovação nunca libera acesso (crítico)

Quando um débito de ciclo é liquidado, o Inter notifica na chave Pix (`pix[]`). O webhook confirma a liquidação sempre em `/pix/v2/cob/{txid}` — rota da cobrança imediata. Ciclos seguintes vivem em `/pix/v2/cobr/{txid}`. A consulta falha, a confirmação volta nula e o código registra "acesso não liberado": o cliente é debitado e não recebe extensão de plano.

Correção: escolher a rota pelo `cycle_index` da cobrança (0 → `cob`, >0 → `cobr`), com fallback pelo prefixo do txid (`aurac<N>`). O replay da auditoria, que reenvia como `pix[]`, é corrigido pelo mesmo ajuste.

## 2. Dedupe engole a reentrega quando a confirmação falha

O evento é registrado antes de ser processado. Se a confirmação no Inter falha por instabilidade momentânea, o evento já está "consumido": a reentrega do próprio Inter é descartada como duplicada e a recuperação passa a depender só da varredura diária.

Correção: liberar o registro de dedupe (`inter_webhook_events`) quando saímos sem processar, para que a reentrega volte a valer.

## 3. Auditoria pode cobrar mandato sem 1º pagamento

O runner só emite ciclo depois de confirmar que o ciclo 0 (QR composto) foi pago. O backstop da auditoria não faz essa checagem: mandato aprovado no banco, mas com o pagamento imediato não liquidado, pode receber cobrança de ciclo.

Correção: aplicar na auditoria a mesma guarda do runner (ciclo 0 com pagamento registrado).

## Detalhes técnicos

- `supabase/functions/webhook-inter/index.ts` — rota de confirmação por ciclo + liberação da dedupe em falha de confirmação.
- `supabase/functions/inter-pix-audit/index.ts` — guarda de 1º pagamento no backstop de emissão de ciclos.

Sem migração de banco. Após o deploy, valido `inter-pix-cycle-runner` e `inter-pix-audit` em `dry_run`; fica pendente apenas o teste real de R$ 6,90 antes de virar o `pix_gateway` para `inter`.