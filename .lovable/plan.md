## Diagnóstico (já investigado no banco)

Confirmei a suspeita: **leads estão tentando pagar PIX e não conseguem desde 13/jun**. De 13/jun até hoje (25/jun), **14 leads abriram cobrança PIX e ZERO pagaram**. Antes disso, ~50% pagavam no mesmo dia.

### Causa raiz

Toda cobrança PIX criada para novo cliente vem com `dueDate` ~38 dias no futuro:

```text
created_at  →  dueDate
2026-06-25  →  2026-08-03
2026-06-22  →  2026-07-31
2026-06-20  →  2026-07-29
2026-06-19  →  2026-07-28
2026-06-18  →  2026-07-27
...
```

Comparado com o padrão antigo que funcionava (até 12/jun), o Asaas criava **duas** cobranças por assinatura nova: uma com `dueDate = hoje` (paga na hora, virava `RECEIVED`) e outra com `dueDate = hoje+30` (próximo ciclo, `PENDING`). De 13/jun para cá, só a "do próximo ciclo" está sendo criada. O cliente abre o invoiceUrl, vê vencimento em 5–6 semanas e o QR PIX nem aparece pra pagar agora → desiste.

### Drift de deploy (causa secundária a confirmar)

O `criar-pix-recorrente-asaas` no repo usa `POST /pix/automatic/authorizations` (PIX Automático Bacen) e gravaria em `asaas_pix_authorizations`. Essa tabela está **vazia** (0 linhas). Mas as cobranças que estão chegando têm `asaas_subscription_id` `sub_xxx` + `externalReference: aura_sub_<plan>_<billing>_<ts>` — claramente vêm de `POST /subscriptions`, padrão antigo. Ou seja: **a função deployada em produção não corresponde ao código no repo**, batendo com o problema conhecido de drift Lovable → GitHub Actions.

### Impacto

- Zero pagamentos PIX em 13 dias. ~14 leads quentes perdidos.
- Tudo de cartão (Stripe) seguiu rodando normalmente — bug é isolado no fluxo PIX mensal.

---

## Plano de correção

### 1. Inspecionar a função deployada em produção
Bater código real do `criar-pix-recorrente-asaas` em execução (via `supabase functions inspect` / dashboard / `tool_search` p/ logs) contra o repo. Confirmar se está rodando a versão antiga de `/subscriptions`. Salvar o snapshot pra ter histórico.

### 2. Decidir o caminho canônico (perguntar antes de aplicar)
Duas opções, escolhe-se UMA:

- **Opção A — manter `/subscriptions` (Asaas legado, mais simples):** consertar a função para que a primeira cobrança tenha `nextDueDate = hoje (BRT)` em vez de `hoje + 1 ciclo`. É o comportamento que funcionava antes de 13/jun.
- **Opção B — migrar pra PIX Automático Bacen:** redeploy do que está no repo (`/pix/automatic/authorizations`). É a Jornada 3 (QR único pra 1º pagamento + autorização de débito recorrente). Mais robusta, mas exige que PIX Automático esteja habilitado na conta Asaas (a função `asaas-check-pix-automatico` já existe pra diagnosticar isso — rodar antes).

### 3. Aplicar o fix da opção escolhida
- **Se A:** `criar-pix-recorrente-asaas` passa a usar `/subscriptions` com `nextDueDate = todayBRT`, `billingType: PIX`, ciclo correto. Forçar deploy via GH Actions pra eliminar o drift.
- **Se B:** confirmar via `asaas-check-pix-automatico` que `/pix/automatic/authorizations` retorna 2xx; redeploy da versão atual do repo.

### 4. Validação pós-deploy
- Criar cobrança PIX de teste (R$ 0,01 ou plano essencial) e confirmar: invoiceUrl exibe QR válido pra pagar **agora**, `dueDate = hoje`, `status` vira `RECEIVED` no webhook após pagamento.
- Conferir métricas: nova linha `RECEIVED` aparece em `asaas_payments` dentro de minutos.

### 5. Recuperar leads dos últimos 13 dias
Os 14 PENDING entre 13/jun e 25/jun têm nome/email/phone gravados. Plano:
- Listar via SQL e revisar manualmente (lista anexa abaixo).
- Mandar via WhatsApp/email um link novo de checkout PIX (já corrigido). Reusar o template de abandoned-checkout em `recover-abandoned-checkout-whatsapp` ou enviar manualmente do admin.
- Opcional: deletar/cancelar as subscriptions antigas no Asaas pra não confundir (`DELETE /subscriptions/{id}`).

### 6. Guardrail futuro
Adicionar alerta simples no admin: se `asaas_payments` ficar > 48h sem nenhum `RECEIVED` enquanto houver `PENDING` recentes, dispara email pro `ADMIN_ALERT_EMAIL`. Evita ficar 13 dias sem perceber de novo.

---

## Leads a recuperar (PENDING desde 13/jun)

```text
2026-06-25  charlesvitoria1975@gmail.com   direcao
2026-06-22  vmelba25@gmail.com             direcao
2026-06-21  ivanfreitas70@gmail.com        direcao
2026-06-20  cris.guckert@gmail.com         direcao
2026-06-20  malta.caiane@gmail.com         essencial
2026-06-19  milda.feitosa35@gmail.com      essencial
2026-06-19  jairoaugusto30@gmail.com       essencial
2026-06-18  paulamdeassis@hotmail.com      essencial
2026-06-18  studiokelyoliveira@gmail.com   transformacao
2026-06-18  luiz.junior@fogas.com.br       direcao
2026-06-16  s.acs.1000@gmail.com           essencial
2026-06-15  raisilva92@gmail.com           transformacao
2026-06-14  apsgheller@hotmail.com.br      essencial
2026-06-13  d12uda.ass@gmail.com           direcao
2026-06-13  du12da.ass@gmail.com           direcao
```

---

## Perguntas pra destravar

1. **Opção A ou B?** (corrigir `/subscriptions` com dueDate=hoje, ou migrar pra PIX Automático Bacen)
2. Quer que eu já dispare a recuperação dos 14 leads junto, ou prefere validar só o fix técnico primeiro e cuidar dos leads em outra rodada?
