# Por que a Isabella recebeu o WhatsApp de recuperação de checkout

## O que os dados mostram

- Checkout criado **10:27 BRT** (`pix_auto`), e o PIX de R$ 29,90 foi **pago 10:27 BRT** — mas esse pagamento é parcela de mandato Woovi, que **não vem por webhook nem aparece em `/api/v1/charge`** (só no extrato).
- Às **10:45 BRT** a rotina de recuperação rodou. Nesse instante, localmente: sessão ainda `status = created`, **nenhum perfil** (o perfil só foi criado **10:46:58**, um minuto depois) e nenhum registro pago.
- Resultado: para o sistema ela era uma lead de 18 minutos que não pagou → disparou o template de 15min.

## Causa raiz

As duas rotinas de recuperação (`recover-abandoned-checkout-whatsapp` e `recover-abandoned-checkout`) só sabem checar três coisas antes de disparar: perfil `active/trial`, `checkout_sessions.status = completed` e `asaas_payments` em `RECEIVED/CONFIRMED`. **Nenhuma delas olha o trilho Woovi.** Como o pagamento Woovi de mandato demora a ser reconciliado (depende da varredura de extrato), existe uma janela em que quem já pagou continua parecendo abandono.

## O que fazer

1. **Deixar a recuperação Woovi-aware** (as duas funções): antes de disparar, montar o set de "já pagou" também com
   - `woovi_charges` pagas/concluídas (por e-mail/telefone/CPF do pagador), e
   - `woovi_subscriptions` com mandato `ACTIVE`/`APPROVED` (mandato aprovado = intenção concluída, não abandono).
2. **Guarda por método de pagamento**: sessão com `payment_method = 'pix_auto'` cujo mandato existe no Woovi nunca entra na fila de recuperação, mesmo antes da parcela ser reconciliada.
3. **Manter os 15 minutos** e resolver por checagem ao vivo: para candidata com `payment_method = 'pix_auto'` sem registro local de pagamento, consultar a Woovi na hora (assinatura/mandato + extrato do CPF/e-mail) imediatamente antes de disparar. Se houver mandato aprovado ou parcela paga, marca a sessão como paga e não envia.
4. **Fechar o atraso na origem**: rodar a varredura de extrato da Woovi (`woovi-pix-audit`, scan 6) com frequência curta nas primeiras horas após um mandato aprovado, para o pagamento aparecer localmente em minutos e não no ciclo diário — assim a checagem ao vivo passa a ser só rede de segurança.
5. **Não punir a lead pelo erro**: o disparo indevido queima o cap vitalício de contatos dela. Limpar o registro de recuperação dessa sessão para não marcar o telefone como já contatado.

## Detalhes técnicos

- Arquivos: `supabase/functions/recover-abandoned-checkout-whatsapp/index.ts` (sets `completedEmailSet`/`completedPhoneSet` + `processStage`), `supabase/functions/recover-abandoned-checkout/index.ts` (mesmos sets), `supabase/functions/woovi-pix-audit/index.ts` (cadência da varredura de extrato).
- Consultas novas restritas aos últimos 30 dias, iguais às já usadas para Asaas, para não pesar a rotina de 5 minutos.
- Redeploy necessário nas três funções.
