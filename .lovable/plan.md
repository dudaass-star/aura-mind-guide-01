# PIX Automático Woovi — o que já está pronto e o que falta pra ficar 100%

## Diagnóstico (verificado agora no código e no banco)

O trilho está construído quase inteiro, mas **não está em produção e nunca teve um pagamento real concluído**.

Pronto e funcionando:
- Criação do QR composto (entrada + mandato fixo) em `criar-pix-recorrente-woovi`, com compensação automática quando a Woovi devolve valor divergente.
- Webhook (`webhook-woovi`) tratando mandato aprovado/rejeitado/cancelado, cobrança paga, Meta CAPI, idempotência por `event_key` e dunning de ciclo não pago.
- Auditoria `woovi-pix-audit` rodando a cada 15 min (cron ativo) e cadência de dunning D+2/D+4/D+7 já provider-aware em `execute-scheduled-tasks`.
- Cancelamento do mandato Woovi no `cancel-subscription` e aviso no portal de que PIX Automático não tem cartão pra atualizar.

Problemas reais encontrados:

1. **Vocabulário de status divergente (bug que cala a auditoria).** O `criar-pix-recorrente-woovi` grava o status cru da Woovi (`ACTIVE`, `REJECTED`), enquanto a auditoria e a guarda anti-duplicidade procuram os rótulos em português (`APROVADA`, `ATIVA`). Resultado: mandatos ativos não são reconhecidos — nem para recuperar conclusão parcial, nem para detectar mandato revogado no banco, nem para impedir assinatura duplicada. Hoje há 4 mandatos de teste no banco, 3 deles com status `ACTIVE`/`REJEITADA` fora do vocabulário esperado.

2. **Nenhum pagamento real fechado.** Todos os mandatos estão com `entry_paid_at` e `mandate_approved_at` nulos, e a tabela de cobranças está vazia (0 registros). Ou seja: o caminho "banco aprova → entrada cai → acesso liberado → ciclo 1 debitado" nunca foi validado ponta a ponta.

3. **O trilho está desligado no checkout.** `system_config.pix_gateway` = `asaas` e o `pix_rail_status` está `healthy: false` (Asaas devolvendo 401). Com isso, o PIX simplesmente não aparece no checkout. Trocar o trilho pra Woovi hoje só é possível editando a configuração à mão — o painel admin só troca o gateway de cartão.

4. **Sem backstop de ciclo.** O Inter tem um runner diário que garante o débito do ciclo; na Woovi dependemos 100% da Woovi gerar a cobrança e o webhook chegar. Se o webhook falhar, ninguém percebe.

5. **Troca de plano sem rota Woovi.** `change-subscription-plan` só conhece Stripe e Asaas — quem estiver na Woovi cai em erro genérico em vez de receber a orientação de novo mandato.

## O que eu faço

### 1. Normalizar o status do mandato (P0, corrige a auditoria)
Traduzir o status da Woovi para o vocabulário interno num único ponto compartilhado (`APROVADA`, `REJEITADA`, `CANCELADA`, `CRIANDO`), usar isso na criação, no webhook e na auditoria, e migrar os registros de teste já gravados. Sem isso, todos os mecanismos de segurança do trilho ficam cegos.

### 2. Backstop de ciclo (P0)
Estender a auditoria para conferir, nos mandatos aprovados com `next_charge_date` vencida, se a Woovi gerou a cobrança do ciclo. Se não gerou, gerar via API; se gerou e está paga sem registro local, reprocessar pelo webhook (mesma lógica já usada para a entrada).

### 3. Validação com dinheiro real (P0)
Gerar um QR novo de R$ 6,90 no plano Essencial e acompanhar no banco: entrada paga, mandato aprovado, banco pagador registrado, acesso liberado e ciclo 1 agendado. Testar em Nubank (2 telas) e Banco do Brasil (tela única) para confirmar as duas variações.

### 4. Ligar o trilho com segurança (P1)
Colocar um seletor de trilho PIX (`asaas` / `inter` / `woovi` / `off`) no admin, com sonda de saúde antes de promover, e só então virar o `pix_gateway` para `woovi` — depois que o teste real do item 3 passar.

### 5. Troca de plano e recuperação (P1)
Rota Woovi no `change-subscription-plan`: cancela o mandato atual e devolve um QR novo já no plano escolhido. E incluir a Woovi no `reprocess-dunning`, que hoje é só Stripe.

## Detalhes técnicos
- Novo helper em `supabase/functions/_shared/woovi.ts` com `normalizeMandateStatus()`; ajustes em `criar-pix-recorrente-woovi/index.ts` (persistência e guarda anti-duplicidade), `webhook-woovi/index.ts` e `woovi-pix-audit/index.ts`.
- Migração de dados normalizando `woovi_subscriptions.status` das linhas existentes.
- Backstop de ciclo dentro de `woovi-pix-audit` (sem nova função nem novo cron).
- Seletor de trilho em `src/pages/AdminSettings.tsx` gravando `system_config.pix_gateway`, reaproveitando o `probe_gateway` que o health-check já suporta.
- Nada muda no trilho do cartão (Stripe) nem no Asaas/Inter.
