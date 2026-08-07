# Ativar os avisos de dunning com os SIDs aprovados

Os degraus de oferta (30% off e Lite) já saem e são entregues. O furo restante é só o **aviso 1 e 2**: hoje o helper usa `HXaf4af1e1f5d4cf40b6fff6b5b68df29a` (`aura_recuperacao_semanal1`), que voltou `ErrorCode 63027` em 06/08 e 07/08 nos registros reais de tentativa. Como os templates agora estão aprovados, o passo é confirmar qual SID de aviso o sender aceita e ligá-lo — sem depender de novo deploy.

## O que será feito

1. **Confirmar aprovação e sender de verdade**
   - Consultar na Twilio o status de aprovação/WhatsApp de: `dunning_notice_v2` (`HX68e8ebce4c2ca1750a12ee20e4d2892a`), `aura_recuperacao_semanal1`, `copy_of_aura_recuperacao` e `aura_recuperacao_24hs`.
   - Registrar quais estão aprovados **para o número da subaccount de recuperação** (é aí que o 63027 aparece, não na lista do Meta).

2. **Ligar o aviso correto**
   - Gravar em `system_config`: `dunning_notice_content_sid` = SID aprovado com botão dinâmico (`.../pagamento?t={{2}}`).
   - Se nenhum aviso com link dinâmico estiver entregável, usar o aviso com botão fixo (quick reply / URL fixa, só `{{1}}`) e mandar o link de pagamento como texto logo após o clique — a estratégia que já usamos no resto do WhatsApp.

3. **Teste controlado antes de confiar**
   - Disparar aviso 1 e aviso 2 para o número de teste e confirmar `MessageStatus = delivered` no `dunning_attempts` (sem 63027).
   - Confirmar que o botão abre `/pagamento?t=<token>` e resolve o checkout/fatura certo.

4. **Recuperar os ciclos que ficaram sem aviso**
   - Reprocessar as tentativas com `error_stage = twilio_delivery_failed (63027)` para que o cliente receba o aviso agora, respeitando o teto por ciclo.
   - Conferir se os retries agendados (`scheduled_tasks` `retry-*`) passam a existir.

5. **Fechar a auditoria**
   - `offer_tier` continua nulo nas tentativas recentes (o código já grava): revalidar depois do próximo envio e, se seguir nulo, corrigir o ponto de gravação.
   - Atualizar a documentação do dunning com o SID de aviso definitivo.

## Detalhes técnicos

- Arquivos envolvidos: `supabase/functions/_shared/dunning-whatsapp.ts` (constante/`resolveNoticeSid`), `supabase/functions/reprocess-dunning/index.ts`, `supabase/functions/webhook-twilio-recovery/index.ts` (status callback), `mem/features/recovery/dunning-whatsapp.md`.
- Nenhuma mudança de cadência: seguem 2 avisos → 30% off → Lite no cartão, e 2 avisos → Lite no PIX.
- A troca de SID roda por `system_config`, então dá para reverter na hora sem deploy.
