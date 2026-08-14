# Pixel e eventos do Meta: você está certo sobre o Furo 1 — sobraram 2 furos reais

## Correção: o site publicado já está atualizado

Você tem razão, era só falta de histórico. Verifiquei agora o bundle que está no ar (`olaaura.com.br`): ele **já contém** o `external_id` (cookie `aura_eid`) e **não contém mais** o evento `Lead`. E nos logs, todo evento a partir de 18:43 sai com `external_id`:

| Hora | Evento | external_id |
|---|---|---|
| 18:32 e 18:39 | PageView / ViewContent | não (build anterior no navegador do visitante) |
| 18:43 em diante | PageView / ViewContent | sim, em 100% |

Os 4 `Lead` do dia são todos de 16:21, anteriores à publicação. Não há nenhum depois. Então: **Furo 1 encerrado** — nada a fazer além de deixar o histórico acumular. Os `PageView` sem `external_id` que ainda aparecerem nas próximas horas são visitantes com o JavaScript antigo em cache, e desaparecem sozinhos.

## Furo real 1 — Telefone em dois formatos: o Meta não junta a mesma pessoa

No checkout o telefone vai com 11 dígitos (`21999998888`); nos webhooks de compra vai com o código do país (`5521999998888`). Como esses campos são enviados em hash, dois formatos = duas pessoas diferentes para o Meta. Resultado: `InitiateCheckout` e `Purchase` não costuram, a Correspondência de Eventos cai e a campanha otimiza com sinal pior — é exatamente o que encarece o resultado.

Ação: normalizar para BR (`55` + DDD + número) dentro do `meta-capi`, antes do hash. Um só ponto conserta checkout e todos os gateways de uma vez.

## Furo real 2 — O `external_id` do navegador não chega na compra

O cookie `aura_eid` identifica o visitante desde o primeiro `PageView`, mas o `Purchase`/`Subscribe` sai do servidor, onde o cookie não existe — e o cache de identidade guarda hoje só `fbp`/`fbc`. Sem isso, a chave mais forte do funil (a mesma pessoa do anúncio até a compra) se perde no último passo.

Ação: gravar o `external_id` no cache de identidade quando o `InitiateCheckout` chegar com e-mail/telefone, e reaproveitá-lo em `Purchase` e `Subscribe`.

Junto disso: a busca no cache por telefone compara o número cru, então um registro salvo com 11 dígitos nunca casa com a consulta de 13 — a normalização acima resolve.

## Detalhes técnicos

- `supabase/functions/meta-capi/index.ts`: `normalizeBrPhone()` antes do hash de `ph` e do `external_id` derivado do telefone; gravar `external_id` no `meta_identity_cache`.
- `supabase/functions/_shared/meta-identity.ts`: normalizar telefone na gravação e na consulta (com fallback por sufixo para registros antigos); `resolveMetaIdentity` passa a devolver `external_id`.
- `supabase/functions/{stripe-webhook,webhook-woovi,webhook-inter,webhook-asaas}/index.ts` e `_shared/meta-subscribe.ts`: repassar o `external_id` resolvido em `user_data`.
- Migração: coluna `external_id` em `meta_identity_cache`.
- Nada muda em preço, cobrança, regras de `Purchase`/`Subscribe` ou fluxo de pagamento.

## Verificação (janela de 24-48h, agora com histórico limpo)

1. `Lead` permanece em zero.
2. `external_id` perto de 100% em `PageView`/`ViewContent` no painel de qualidade do sinal.
3. No próximo checkout real: mesmo hash de telefone e mesmo `external_id` em `InitiateCheckout` e `Purchase`.
4. Correspondência de Eventos e custo por resultado no Gerenciador de Anúncios.
