# Pixel e eventos do Meta: o que já está 100% e os 3 furos que ainda encarecem o anúncio

## Verificado agora (dados reais, últimas 24h)

| Evento | Envios | fbc | fbp | e-mail/tel. | external_id | Erros |
|---|---|---|---|---|---|---|
| PageView | 92 | 56 | 78 | 0 | 2 | 0 |
| ViewContent | 73 | 44 | 59 | 0 | 2 | 0 |
| InitiateCheckout | 4 | 4 | 4 | 4 | 0 | 0 |
| Lead | 4 | 4 | 4 | 4 | 0 | 0 |
| Purchase (Woovi) | 1 | 1 | 1 | 1 | 0 | 0 |

Zero erro de resposta do Meta. Teste de ponta a ponta no navegador confirmou `PageView` e `ViewContent` saindo com `fbc` e `external_id`, `ViewContent` sem preço, e um único `PageView` no redirecionamento `/` → `/v2`. Purchase/Subscribe dos 4 gateways já mandam e-mail, telefone, nome e o `fbp/fbc` do cache de identidade.

## Furo 1 — O site no ar ainda é o build antigo (bloqueia todo o resto)

`Lead` continua saindo (4 nas últimas 24h, sempre em par com `InitiateCheckout`) e `external_id` apareceu em apenas 2 de 92 `PageView` — esses 2 são do meu teste local. Ou seja: as melhorias de sinal estão no código, não no ar.

Ação: **publicar**. Sem isso, nada abaixo produz efeito no custo da campanha.

## Furo 2 — O telefone vai em dois formatos diferentes, então o Meta não junta a mesma pessoa

No checkout o telefone é enviado com 11 dígitos (`21999998888`). Nos webhooks de compra ele vai normalizado com o código do país (`5521999998888`). Como `ph` e o `external_id` derivado do telefone são hashes, dois formatos = duas pessoas diferentes aos olhos do Meta. Consequência direta: `InitiateCheckout` e `Purchase` não costuram, a Correspondência de Eventos cai e o algoritmo otimiza com sinal mais pobre (CPA mais alto).

Ação: normalizar o telefone para BR (`55` + DDD + número) dentro do `meta-capi`, antes de hashear — vale para `ph` e para o `external_id` derivado. Um só lugar, corrige checkout e webhooks de uma vez.

## Furo 3 — O `external_id` do navegador morre no meio do caminho

O cookie próprio (`aura_eid`) identifica o visitante desde o primeiro `PageView`, mas o `Purchase` sai do servidor, onde esse cookie não existe. Hoje o cache de identidade guarda só `fbp`/`fbc`.

Ação: guardar também o `external_id` do navegador no cache de identidade quando o `InitiateCheckout` chega com e-mail/telefone, e reaproveitá-lo em `Purchase`/`Subscribe`. Isso liga anúncio → visita → compra pela mesma chave estável, que é o sinal que o Meta mais valoriza para reduzir custo.

Ainda no mesmo ponto: a busca no cache por telefone compara o número cru, então um registro salvo com 11 dígitos nunca casa com a consulta de 13. A normalização do Furo 2 resolve isso junto.

## Otimizações de custo que entram no mesmo passo

- **Deduplicação à prova de falha**: manter `event_id` idêntico entre navegador e servidor em todos os eventos (já é o caso) e passar a registrar no painel quando um evento sai só por um dos lados.
- **Painel**: a coluna `external_id` já foi adicionada à tabela de qualidade do sinal; depois de publicar, ela deve ir de ~2% para perto de 100% no `PageView`/`ViewContent` — é o indicador para acompanhar a melhora da correspondência.

## Detalhes técnicos

- `supabase/functions/meta-capi/index.ts`: `normalizeBrPhone()` aplicada antes do hash de `ph` e do `external_id` derivado; gravação de `external_id` no `meta_identity_cache`.
- `supabase/functions/_shared/meta-identity.ts`: `normPhone` passa a gravar/consultar sempre com `55`, com fallback por sufixo para registros antigos; `resolveMetaIdentity` devolve `external_id` além de `fbp/fbc`.
- `supabase/functions/{stripe-webhook,webhook-woovi,webhook-inter,webhook-asaas}/index.ts` e `_shared/meta-subscribe.ts`: repassar o `external_id` resolvido no `user_data`.
- Migração: coluna `external_id` em `meta_identity_cache`.
- Nada muda em preço, cobrança, regras de `Purchase`/`Subscribe` ou no fluxo de pagamento.

## Verificação depois do deploy e da publicação

1. `Lead` deve zerar (só `InitiateCheckout`).
2. Cobertura de `external_id` perto de 100% em `PageView`/`ViewContent`.
3. No próximo checkout real: `InitiateCheckout` e `Purchase` com o mesmo hash de telefone e o mesmo `external_id`.
4. Acompanhar por 48h a Correspondência de Eventos no Gerenciador e o custo por resultado.
