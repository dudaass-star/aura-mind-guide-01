# PIX Automático — ajustes para o fluxo ficar confiável daqui pra frente

A base já está montada (autorização com retryPolicy 3R/7D, QR de 24h, webhook de estados, status em tempo real no checkout, auditoria diária às 09:30 BRT e e-mails de recuperação/alerta). O que falta são as brechas que só aparecem quando um webhook não chega ou o cliente sai da tela.

## O que ficou frágil hoje

1. **A auditoria confia só no nosso banco.** Se a Asaas não entregar um webhook, a autorização fica com status errado para sempre e ninguém percebe.
2. **Autorização que fica "PENDING" para sempre.** Hoje quem marca como expirada é o webhook. Sem ele, o QR vence e o registro nunca vira perda — logo, nenhum e-mail de recuperação.
3. **Janela de recuperação de 48h.** Autorização perdida numa sexta pode escapar; e o e-mail é disparado uma única vez sem segunda chance.
4. **Alerta de débito não disparado se repete todo dia.** O campo `autodebit_alert_sent_at` é gravado mas nunca consultado, então o mesmo caso vira e-mail diário até você resolver.
5. **Cliente que fecha o modal do QR perde o retorno.** O acompanhamento só roda com o modal aberto; se ele autoriza no banco depois, não vê confirmação nenhuma.
6. **Nenhuma visão no admin.** Só dá para saber como o PIX Automático está indo abrindo o e-mail da auditoria.

## Ajustes propostos

### 1. Reconciliação real com a Asaas (auditoria)
Antes de concluir qualquer coisa, a auditoria passa a consultar a Asaas para as autorizações não finais (`PENDING`/`ACTIVE`) e sincronizar status, `activated_at`/`cancelled_at` e assinatura vinculada. Assim webhook perdido deixa de virar dado errado.

### 2. Varredura de QR vencido
Autorização ainda `PENDING` com `qr_expires_at` no passado (e sem confirmação de ativação na Asaas) passa a ser marcada como `EXPIRED` pela própria auditoria e entra na fila de recuperação.

### 3. Recuperação com janela maior e um segundo toque
- Janela sobe de 48h para 7 dias.
- Um segundo e-mail 72h depois do primeiro, se a pessoa não voltou (nada de terceiro; sem spam).
- Continua um envio por autorização por etapa, com chave de idempotência.

### 4. Alerta de débito com silêncio de 7 dias
O alerta por autorização só volta a ser enviado se `autodebit_alert_sent_at` tiver mais de 7 dias. O resumo diário passa a separar "novos" de "ainda abertos".

### 5. Retomada do acompanhamento no checkout
O identificador da autorização passa a ser guardado no navegador e o acompanhamento volta sozinho se a pessoa reabrir o checkout dentro de 24h — mostrando "autorizado" ou "expirou, gere outro PIX". Intervalo de 4s nos primeiros 2 minutos e 10s depois, com parada automática após 20 minutos ou ao virar estado final.

### 6. Bloco de PIX Automático no painel admin
Um cartão em Engajamento com os números do período: autorizações criadas, ativadas, perdidas, taxa de autorização e lista de débitos que não dispararam. É o que permite dizer "está funcionando" com dado em mão.

## Detalhes técnicos

- `supabase/functions/asaas-pix-auto-audit/index.ts`: novo passo de reconciliação via `GET /pix/automatic/authorizations/{id}` (e `.../payments` quando disponível), varredura de `qr_expires_at`, dedupe de alerta por 7 dias, segundo toque de recuperação (`recovery_email_2_sent_at`).
- Migração: colunas `recovery_email_2_sent_at timestamptz` e `last_synced_at timestamptz` em `asaas_pix_authorizations` (RLS/grants já existentes na tabela, sem mudança de política).
- `supabase/functions/asaas-pix-auto-status/index.ts`: sem mudança de contrato; devolve também `plan` e `billingPeriod` para a mensagem de retomada.
- `src/pages/CheckoutV2.tsx`: persistência do `authorizationId` em `localStorage` (TTL 24h), retomada do polling na montagem, backoff e teto de 20 min.
- `supabase/functions/admin-engagement-metrics/index.ts` + `src/pages/AdminEngagement.tsx`: agregação e cartão "PIX Automático".
- Deploy das funções alteradas ao final; cron atual (`pix-auto-audit-daily`, 09:30 BRT) permanece.

## Fora de escopo

- Recuperar as 12 autorizações recusadas de junho/julho (coorte antiga, foco é o futuro).
- Investigar com o suporte Asaas por que débitos em autorizações já `ACTIVE` não dispararam — segue como ação sua, com os IDs já levantados.
