# Auditoria do PIX Automático (Bacen/Inter) — o que está furado antes de virar a chave

Verifiquei o trilho inteiro contra o código e contra a API do Inter: mandato, QR composto, webhook, emissor de ciclos, retentativa, auditoria, cancelamento, troca de plano, portal e dunning. O motor está montado, mas há **3 furos bloqueantes** que fariam cliente pagar e não receber acesso.

## Bloqueantes

### 1. Cliente novo paga e não ganha acesso (nenhum perfil é criado)
No trilho Asaas o webhook **cria o perfil** quando o pagamento entra (nome, plano, `plan_expires_at`, `needs_schedule_setup`, jornada inicial, `whatsapp_provider`). O `webhook-inter` só procura perfil existente e, quando não acha, grava "acesso pendente de provisionamento" e desiste. Ou seja: toda venda nova por PIX Inter morre silenciosamente.
Correção: replicar em `webhook-inter` o mesmo bloco de criação/atualização de perfil do Asaas (incluindo o caso "returning" e o upgrade), com `card_gateway = "inter"`.

### 2. Renovação encurta o acesso do cliente
`activateAccess` calcula a nova validade a partir de `rec.plan_expires_at` — **essa coluna não existe** em `inter_pix_recurrences`. O valor é sempre `undefined`, então toda renovação conta a partir de hoje e o cliente perde os dias restantes do ciclo. A base tem que vir do `plan_expires_at` do perfil (como no Asaas).

### 3. Não há confirmação de que a notificação de pagamento chega
Os webhooks de mandato (`webhookrec`) e de cobrança recorrente (`webhookcobr`) estão registrados no Inter (confirmei via API). Mas o pagamento do **1º ciclo** (o QR composto) chega pela rota de Pix comum, `/pix/v2/webhook/{chave}` — e não há verificação de que essa rota está registrada. Sem ela: cliente paga, dinheiro entra e nada acontece.
Correção: checar/registrar essa rota e incluir a checagem no `inter-health-check`.

## Ajustes de confiabilidade

4. **Mandato ainda não aprovado pode ser cobrado.** O runner aceita status `CRIADA` — que significa "aguardando autorização do pagador". Restringir a emissão a `APROVADA`/`ATIVA`.
5. **Contagem de ciclo pode colidir.** O runner pega o maior `cycle_index`, mas cobranças gravadas pelo webhook (txid desconhecido) entram com `cycle_index` nulo; em Postgres o nulo vem primeiro no `desc` e o próximo ciclo volta a 1. Filtrar nulos e preencher `cycle_index`/`user_id` no upsert do webhook.
6. **Webhook sem autenticação.** `webhook-inter` aceita qualquer POST: um payload forjado com um `txid` conhecido libera acesso. Adicionar validação (allowlist de faixa de IP do Inter ou segredo na URL) como o token que o Asaas usa.
7. **Reautorização não cobre o Inter.** A página `/reautorizar-pix` chama sempre `criar-pix-recorrente-asaas`. Cliente Inter com mandato revogado não tem como voltar — o link do dunning cai num erro.
8. **Troca de plano no portal não enxerga o Inter.** `ChangePlanDialog` só roteia Stripe/Asaas; a função `change-inter-plan` existe mas ninguém chama.
9. **"Atualizar forma de pagamento" no portal** não tem ramo Inter (hoje o PIX Automático não tem cartão para atualizar — o certo é explicar e oferecer reautorização).
10. **Formato de emissão de ciclo nunca foi validado contra a API real.** O `PUT /pix/v2/cobr/{txid}` e a rota de retentativa `PUT /pix/v2/cobr/{txid}/retentativa/{data}` foram escritos pela especificação Bacen, sem uma única chamada bem-sucedida. Rodar a sonda com valor mínimo antes do flip; se o Inter recusar, o campo exato aparece em `violacoes[]`.
11. **Sem CAPI de renovação e com `is_first_purchase: true` fixo.** Está correto hoje (renovação não chama CAPI), mas o campo fixo vira mentira se algum caminho novo passar por lá.

## Ordem sugerida

1. Itens 1, 2 e 3 (sem eles, virar a chave é cobrar sem entregar).
2. Itens 4, 5 e 6 (integridade e segurança).
3. Item 10: teste real de R$ 6,90 ponta a ponta (QR → pagamento → acesso → welcome), depois forçar um ciclo com vencimento curto para validar `cobr` e retentativa.
4. Itens 7, 8 e 9 (manutenção pelo cliente).
5. Só então `system_config.pix_gateway = "inter"`. Hoje está `asaas` e o health check marca o Asaas como caído (HTTP 401), então **o PIX está escondido no checkout** — nenhuma venda por PIX acontece neste momento.

## Notas técnicas

- Já confirmado funcionando: mTLS + OAuth (`_shared/inter-pix.ts`), `txid` determinístico por ciclo, idempotência do webhook por `event_key` (constraint única existe), cancelamento de mandato + remoção de cobranças abertas, crons ativos (`inter-pix-cycle-runner-daily` 09h BRT, `inter-pix-audit-daily` 07h30 BRT) e ambos rodando limpos em dry-run.
- Regra mantida: emissão em D-2 e **nenhum aviso antes do débito**.
- Certificado do Inter expira em 11/08/2027; vencido, toda a recorrência para.
