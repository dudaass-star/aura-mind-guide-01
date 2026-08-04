# Auditoria dos links de dunning (pagamento, 30% off, Lite/Base)

## O que está correto

Links gerados em `_shared/dunning-whatsapp.ts`:
- Aviso genérico: `https://olaaura.com.br/pagamento?t=<token>` — rota existe e resolve via `customer-portal` (Stripe Billing Portal → fallback fatura Asaas em OVERDUE/PENDING).
- Ofertas: `{{2}} = t=<token>&offer=<tier>` com botão `https://olaaura.com.br/cancelar?{{2}}` — rota existe, `CancelSubscription.tsx` aceita `discount_30|lite|base` e `cancel-subscription` aceita `token` como identidade.

## Problemas encontrados

### 1. Bloqueador: os 2 avisos não estão no ar (versão antiga publicada)
Em `dunning_attempts`, todos os envios de 27/07 até hoje 11:00 BRT saíram com `template_sid = HX50cb75...` (30% off) já no `attempt_number = 1`. Pelo código atual do repo, tentativas 1 e 2 deveriam usar o aviso `HXaf4af1...`. Ou seja: quem falha o pagamento recebe desconto antes de qualquer aviso com link de atualizar pagamento.
Ação: republicar as funções que importam o helper (`stripe-webhook`, `webhook-asaas`, `execute-scheduled-tasks`, `reprocess-dunning`, `webhook-twilio-recovery`) e confirmar num envio de teste que a tentativa 1 grava `HXaf4af1...`.

### 2. Cliente PIX recebe oferta de 30% que não pode aceitar
A escada manda `offer=discount_30` pra todos, mas no PIX Asaas a ação `apply_discount_3m` responde "o desconto está disponível apenas para pagamento com cartão". Beco sem saída no degrau 3.
Ação: escolher a escada por gateway — PIX pula o 30% e vai direto pro Lite (`HX18e81f...`); o Base continua só dentro do `/cancelar`.

### 3. PIX Automático (Bacen) sem subscription cai em erro no link de oferta
O caminho PIX do `cancel-subscription` exige `asaas_subscription_id`; quem paga por autorização Bacen sem subscription recebe "Nenhuma assinatura PIX ativa encontrada" em vez da escada.
Ação: sem subscription mas com autorização/pagamento do cliente, devolver o estado de reativação (`no_gateway_subscription` + `offer`) para a escada aparecer.

### 4. `/pagamento` fala "Stripe" mesmo quando manda pra fatura Asaas
Texto fixo "ambiente seguro do Stripe" enquanto o destino pode ser a fatura Asaas com PIX Copia-e-Cola.
Ação: texto neutro ("ambiente seguro de pagamento").

### 5. Link de trocar cartão Asaas pode abrir fatura já paga
No `customer-portal`, o ramo `asaas-card` pega a `invoice_url` mais recente sem filtrar status.
Ação: priorizar `OVERDUE`/`PENDING` e só depois cair na mais recente.

### 6. Template de aviso não cadastrado em `whatsapp_templates`
Os 3 templates de oferta estão lá; `HXaf4af1...` não. Não afeta o envio (Twilio usa o SID direto), mas fica invisível no admin.
Ação: inserir a linha (categoria `dunning_notice`, utility, 2 variáveis).

## Ordem de execução
1 (redeploy) → 2 → 3 → 4, 5, 6.

## Notas técnicas
- Arquivos: `supabase/functions/_shared/dunning-whatsapp.ts`, `supabase/functions/cancel-subscription/index.ts`, `supabase/functions/customer-portal/index.ts`, `src/pages/Pagamento.tsx`, + migration só pra cadastrar o template no admin.
- Contrato de link inalterado: `/pagamento?t=` e `/cancelar?t=&offer=` continuam iguais.