# Recuperação por WhatsApp: o que a correção resolveu e os 3 pontos que ainda não têm prova

As correções de hoje (token no `{{2}}`, short-link no modo degradado, fatura sem assinatura chamando o modo degradado) estão no repositório. Mas os dados do banco mostram que nenhum dos três caminhos novos foi exercitado ainda — os últimos registros são todos de antes do deploy. Sem um teste controlado, não é possível afirmar que está funcional.

## O que os dados mostram hoje

- `offer_tier`: **0 linhas** preenchidas na história inteira de `dunning_attempts`, incluindo o envio de hoje 12:01 BRT (attempt 4, template Lite). Ou seja, o helper novo ainda não estava ativo naquele envio.
- Modo degradado: **0 linhas** com `profile_found = false` e `channel = 'whatsapp'` — apesar de 172 registros `no_subscription_on_invoice` e dezenas de `profile_not_found` (último hoje 03:11 BRT).
- Retry pós-falha de entrega: **0 tarefas** `dunning_offer_whatsapp` com `event_id` começando em `retry-`, mesmo com 3 falhas 63027 recentes que tinham `profile_user_id` (a última hoje 03:01 BRT, Asaas).
- Envio de oferta continua funcionando (30% off em 06/08, Lite em 07/08), então a escada em si está viva.

## Ajuste 1 — Provar o aviso 1/2 com o `{{2}}` corrigido

Enviar o template genérico para um número de teste com o payload novo (só o token) e conferir o status final no callback: se voltar `delivered`, o 63027 está resolvido; se voltar `failed`, o problema é do template no Meta e a decisão passa a ser trocar o ContentSid.

## Ajuste 2 — Provar o modo degradado

Reprocessar um evento real recente de `profile_not_found` e de `no_subscription_on_invoice` e verificar em `dunning_attempts` uma linha com `profile_found = false`, `whatsapp_sent = true` e `offer_tier = 'generic'`. Se travar, os suspeitos são short-link (código não criado), telefone sem DDI e ausência de nome.

## Ajuste 3 — Retry pós-falha e `offer_tier`

Refazer o cenário de falha de entrega (status callback `failed`) e conferir se aparece a tarefa `retry-<sid>` e o e-mail secundário. No mesmo teste, validar que `offer_tier` é gravado. Se o retry não nascer, o ponto é o `.eq("message_sid", ...)` da leitura em `webhook-twilio-recovery` (o insert do attempt e o callback podem correr fora de ordem) — nesse caso, reler com pequena espera/retry antes de desistir.

## Detalhes técnicos

- Testes por invocação direta das funções (`reprocess-dunning` para os casos degradados, `debug-recovery-template` para status Twilio), sempre com um evento real recente.
- Nenhuma mudança de schema. Correções previstas apenas em `supabase/functions/webhook-twilio-recovery/index.ts` (ordem/leitura do attempt no callback) e, se o teste apontar, em `_shared/dunning-whatsapp.ts`.
- Encerrar removendo `debug-recovery-template` do projeto depois do diagnóstico, para não deixar função de depuração publicada.

## Ordem

1. Teste do aviso 1/2 (63027 resolvido ou não).
2. Teste do modo degradado nos dois branches.
3. Teste do retry pós-falha + validação de `offer_tier`.
4. Correções pontuais conforme cada resultado e limpeza da função de debug.
