# Auditoria da recuperação silenciosa do PIX Automático (Woovi)

Revisei o fluxo ponta a ponta (webhook → reciclagem → oferta → encerramento → QR novo). A espinha está correta e coerente com o cartão. Encontrei 4 pontos que impedem chamar de "100% funcional" — dois deles podem mandar oferta para cliente que já pagou.

## O que já está certo (verificado no código)

- `webhook-woovi` não grava `payment_failed_at`, não corta acesso e não manda aviso de falha; rejeições intermediárias (`tryLevel`) só logam.
- O agendamento da reciclagem é idempotente por `subscription_id` (não duplica cadência).
- `execute-scheduled-tasks` recicla a mesma parcela (`/installments/{id}/cobr/retry`, com fallback para criar a CobR), 4x a cada 7 dias, e encerra tudo em silêncio se a parcela for paga no meio.
- Escada de oferta do Woovi resolve certo: `noticeSteps=0` → passo 1 = 30% off, passo 2 = Lite; o link vai para `/cancelar?offer=...`, que no trilho Woovi gera QR novo (o cliente pode pagar de outra conta).
- Fora da janela 08h–21h BRT a oferta é adiada, e o `dunning_offer_whatsapp` preserva `provider` e `notice_steps`.
- `woovi_recovery_final` só cancela o mandato se a parcela ainda estiver em aberto.
- `plan_tier` (lite/base) passa a acompanhar o valor do mandato aprovado.

## Correções a fazer

### 1. Oferta pode ser enviada para quem já pagou (crítico)
Só a tarefa de reciclagem checa "já pagou?". A `woovi_recovery_offer` dispara sem verificar, e o caminho de cobrança paga no webhook não cancela a cadência pendente.
- No início de `woovi_recovery_offer`: se não houver parcela em aberto, cancelar as tarefas pendentes de recuperação e não enviar nada.
- No caminho de cobrança paga do `webhook-woovi`: cancelar `woovi_cycle_recycle`, `woovi_recovery_offer` e `woovi_recovery_final` pendentes daquele mandato.

### 2. A 4ª reciclagem não tem tempo de dar resultado
Na tentativa 4 o código retenta e, no mesmo processamento, agenda a oferta para 60 segundos depois — a oferta sai antes de o banco responder à última tentativa. Isso encurta a janela de ~30 dias e pode oferecer desconto para uma cobrança que ia liquidar.
- Depois da 4ª reciclagem, agendar a oferta para D+7 (fim real da janela), não para +60s.

### 3. Janela de criação da CobR (risco técnico a validar)
O Bacen só permite criar/retentar a CobR de 2 a 10 dias antes do vencimento. Reciclar a MESMA parcela 7, 14 e 21 dias depois do vencimento pode ser recusado pela Woovi — e aí a "recuperação silenciosa" viraria silêncio sem cobrança nenhuma.
- Persistir o status/erro de cada retentativa em `woovi_charges` (hoje só vai no `last_error` do mandato, sobrescrito a cada volta).
- Fallback: se a retentativa for recusada por janela, tentar a CobR da parcela seguinte e, se também recusar, encurtar a janela e ir direto para a oferta com QR novo.

### 4. Mensagem da auditoria fora da escada
Quando o mandato é revogado no banco, o `woovi-pix-audit` manda reautorizar em `olaaura.com.br/v2` (preço cheio), ignorando a escada de retenção.
- Apontar essa mensagem para `/cancelar?t=...&offer=discount_30` quando o usuário ainda estava ativo, para o retorno já sair no degrau de oferta.

## Detalhes técnicos

Arquivos envolvidos: `execute-scheduled-tasks` (casos `woovi_cycle_recycle` e `woovi_recovery_offer`), `webhook-woovi` (caminho de cobrança paga), `_shared/woovi.ts` (retry devolvendo status para persistência), `woovi-pix-audit` (link de reautorização).

Sem migração de banco: `woovi_charges` já tem `status` e `raw_payload` para registrar as retentativas.

Validação: exercitar o executor com um mandato de teste, ler os logs das edge functions e conferir em `scheduled_tasks` que a cadência cancela ao pagar.