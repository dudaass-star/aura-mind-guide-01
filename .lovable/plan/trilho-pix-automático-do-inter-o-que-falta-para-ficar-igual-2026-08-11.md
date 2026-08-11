# Trilho PIX Automático do Inter — o que falta para ficar igual (ou melhor) que o Asaas

## Resposta curta sobre as tentativas após falha

Sim e não. A **política de retentativa está declarada** no mandato do Inter (`politicaRetentativa: "PERMITE_3R_7D"`, equivalente ao `ALLOW_THREE_IN_SEVEN_DAYS` do Asaas): até 3 novas tentativas em 7 dias.

Mas há uma diferença estrutural que hoje é um furo real: o **Asaas é um motor de assinatura** (ele mesmo gera a fatura de cada ciclo e executa as retentativas). O **Inter não é** — ele expõe a API Bacen crua. Quem emite a cobrança de cada ciclo (`POST /pix/v2/cobr`) e dispara a retentativa é o nosso backend. Isso ainda não existe: hoje o trilho do Inter cria o mandato e cobra o 1º ciclo pelo QR composto, e depois **nada emite os ciclos seguintes**.

## Lacunas em ordem de gravidade

### 1. Emissor de ciclos (bloqueante — sem isso não há renovação)
Cron diário `inter-pix-cycle-runner`:
- Varre `inter_pix_recurrences` ativas com vencimento chegando e emite a cobrança **o mais tarde possível**, no limite mínimo de antecedência que o Inter/Bacen aceita — nada de folga extra.
- **Nenhum aviso nosso antes da data.** Não enviamos WhatsApp nem e-mail de "vai debitar em X dias": lembrar o cliente antes do débito só cria janela para ele revogar o mandato e aumenta inadimplência. O cliente só ouve da gente depois do fato (confirmação de renovação ou, se falhar, o dunning).
- Se o Inter/banco do pagador dispara alguma notificação própria por exigência regulatória, isso é do trilho — não replicamos.
- Emite `POST /pix/v2/cobr/{txid}` do próximo ciclo com o valor cheio do plano, grava a linha em `inter_pix_charges` (`cycle_index` incremental) e deixa o webhook confirmar.
- Idempotência por `txid` derivado de `idRec + cycle_index` (nunca cria dois cobr do mesmo ciclo).

### 2. Retentativa explícita após falha
- No webhook, quando um `cobr` volta rejeitado/não realizado (e não `CANCELADA`), registrar a falha e agendar retentativa via `PUT /pix/v2/cobr/{txid}` respeitando o limite 3R/7D.
- Esgotadas as tentativas (ou `CANCELADA`): grava `payment_failed_at` (já existe) → o dunning de 2 avisos + escada de ofertas assume, igual ao Asaas.

### 3. Auditoria/reconciliação (paridade com `asaas-pix-auto-audit`)
Cron `inter-pix-audit`:
- Mandatos parados em `CRIADA` além do TTL do QR (24h) → marca abandonado e alimenta a recuperação de checkout.
- Pagamento liquidado no banco sem linha em `inter_pix_charges` (webhook perdido) → replay no `webhook-inter`, mesma estratégia de `_shared/asaas-reconcile.ts`.
- Ciclo vencido sem cobr emitido → backstop do runner.
- Detecção de fatura gêmea do 1º ciclo (problema já conhecido no Asaas).

### 4. Cancelamento do mandato
`cancel-subscription` trata Stripe, `asaas_card` e `asaas_pix`. Falta o ramo `inter`: cancelar o mandato (`PATCH /pix/v2/rec/{idRec}` → `CANCELADA`) e o cobr aberto — senão o cliente cancela no portal e o débito segue autorizado.

### 5. Reautorização (churn silencioso)
`/reautorizar-pix` é específico do Asaas. No Inter o caminho Bacen é `POST /pix/v2/solicrec`, gerando novo QR/link de autorização, reusado pelo dunning quando o mandato volta rejeitado/cancelado pelo banco do pagador.

### 6. Troca de plano
`change-asaas-plan` não tem equivalente. No Bacen, mudar valor exige nova autorização — a troca de plano no Inter precisa cancelar o mandato atual e abrir um novo QR composto.

### 7. Tracking e funil
`webhook-asaas` dispara Meta CAPI (`purchase`, `is_first_purchase`) e distingue renovação de venda nova. O `webhook-inter` libera acesso e manda welcome, mas **não dispara CAPI nem marca o funil** — venda por Inter ficaria invisível nos anúncios e no painel.

### 8. Ligar o trilho
`system_config.pix_gateway` continua `"asaas"`, então o health gate mantém o PIX escondido no checkout. A virada para `"inter"` deve ser o **último** passo, depois de 1, 2, 4 e 7, com um teste real de R$ 6,90.

## Ordem sugerida

1. Emissor de ciclos + retentativa (1 e 2) — sem isso não há receita recorrente.
2. Cancelamento (4) e tracking/CAPI (7) — risco de cobrança indevida e cegueira de mídia.
3. Auditoria (3).
4. Reautorização (5) e troca de plano (6).
5. Virar o gateway e testar ponta a ponta com pagamento real.

## Notas técnicas

- Tudo reusa `_shared/inter-pix.ts` (mTLS + cache de token; o Inter tem rate limit agressivo, então o runner deve serializar chamadas).
- Funções novas precisam de entrada em `supabase/config.toml` (`verify_jwt = false`) e do step no workflow de deploy, senão o deploy responde "not found in the codebase".
- Crons via `pg_cron` + `pg_net`, horário BRT.
- Certificado do Inter expira em 11/08/2027 — rotação obrigatória antes disso ou toda a cobrança recorrente para.