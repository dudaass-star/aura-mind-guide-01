# PIX Automático Woovi: reemitir o ciclo depois do REJECTED (sem nova autorização)

Sua pesquisa bate com o que está no código, e corrige um ponto que eu disse errado antes: a política de retentativa **já está configurada**. Em `_shared/woovi-subscription-payload.ts` o mandato nasce com `retryPolicy: "THREE_RETRIES_7_DAYS"`, nas duas jornadas. Ou seja, as 3 tentativas em 7 dias já acontecem.

E você está certo no diagnóstico: 7 dias raramente cobrem o ciclo financeiro do cliente. Quem depende do 5º dia útil não tem saldo dentro dessa janela e cai em `REJECTED` — mandato ainda vivo, ciclo perdido.

## Como está hoje

- **Retentativas Bacen**: 3 tentativas em até 7 dias, gerenciadas pela Woovi.
- **Falha de ciclo**: `webhook-woovi` trata `PIX_AUTOMATIC_COBR_FAILED/REJECTED/EXPIRED` no mesmo caminho (`handleUnpaidCycle`): grava a cobrança, marca `payment_failed_at`, envia o aviso 1 na hora e agenda D+2, D+4, D+7.
- **Escada de ofertas**: no PIX vai direto para o Lite no 3º degrau (30% off depende de cartão salvo); Base só em `/cancelar`.
- **Reautorização**: só na auditoria, quando o mandato é cancelado no app do banco — aí realmente não há o que retentar.
- **O que não existe**: nenhuma reemissão de cobrança após o `REJECTED`. O ciclo perdido nunca volta a ser tentado pelo débito automático; a recuperação depende 100% de pagamento manual.
- **Link quebrado para Woovi**: o botão do aviso aponta para `/pagamento` → `customer-portal`, e essa função só tem caminho Stripe e Asaas.

## O que fazer

**1. Reciclo automático do ciclo rejeitado (o ponto central)**
Ao receber `PIX_AUTOMATIC_COBR_REJECTED` de um ciclo, com o mandato ainda ativo e a fatura em aberto: criar uma **nova cobrança recorrente (CobR) na mesma assinatura**, com vencimento adiante. Isso reinicia a janela regulamentada de 3 tentativas em 7 dias **sem pedir nada ao cliente**, porque o mandato original segue valendo.

- Até **2 reciclos** por ciclo mensal: janela de recuperação passa de 7 para cerca de 21 dias.
- Data: +7 dias sobre o vencimento anterior em cada reciclo. Se o cliente tem histórico de pagar em dia fixo, mirar esse dia.
- Valor **igual ao do mandato** — nunca acima, senão o banco recusa por limite.
- Registrar cada reciclo em `woovi_charges` com o índice de tentativa, para auditoria e painel mostrarem "ciclo em recuperação" em vez de "perdido".

**2. Régua de comunicação alinhada ao reciclo**

- **Aviso 1 (no REJECTED)**: "a cobrança não passou; vou tentar de novo automaticamente no dia X — se quiser resolver agora, aqui está o PIX".
- **D+2 e D+4**: mantidos como reforço, com o QR avulso da fatura em aberto (pagar manualmente encerra o ciclo e cancela os reciclos).
- **Ofertas de retenção (Lite / Base)** só entram **depois de esgotar os reciclos**, não no meio da recuperação.
- **Cancelamento do mandato** deixa de ser em D+7 e passa a ocorrer após o último reciclo falhar.

**3. Encerramento antecipado**
Qualquer confirmação de pagamento (webhook de cobrança liquidada ou checagem na API) cancela reciclos e tarefas de dunning pendentes do ciclo. Se o mandato for cancelado pelo banco ou pelo cliente no meio, para tudo e vai para o fluxo de reautorização — o único caso em que reautorizar faz sentido.

## Régua proposta

```text
vencimento
  D0..D+7    3 tentativas Bacen (Woovi, automatico)
  D+7        REJECTED -> aviso 1 + agenda reciclo 1
  D+8..D+14  reciclo 1: nova CobR, 3 tentativas
  D+10       reforco com QR avulso (se ainda em aberto)
  D+14       falhou -> agenda reciclo 2
  D+15..D+21 reciclo 2: nova CobR, 3 tentativas
  D+21       esgotou -> oferta Lite
  D+24       ultimo aviso + cancelamento do mandato

mandato cancelado no banco (a qualquer momento)
  para reciclos -> fluxo de reautorizacao (novo QR de mandato)
```

## Detalhes técnicos

- **Validar primeiro na API da Woovi** o endpoint de criação de cobrança dentro de uma assinatura `PIX_RECURRING` existente (parcela vinculada ao mandato) e o comportamento do vencimento. Se a API não permitir criar parcela em assinatura ativa, cai o fallback: PIX avulso com validade longa por WhatsApp/e-mail, sem reinício da janela Bacen.
- `supabase/functions/webhook-woovi/index.ts`: separar em `handleUnpaidCycle` o caso terminal (`REJECTED`, mandato ativo) do caso "tentativa individual falhou" (`TRY_REJECTED`, que não deve disparar dunning porque a Woovi ainda vai retentar). Hoje ambos caem no mesmo bloco via `UNPAID_CHARGE_STATUSES`.
- Novo `task_type` `woovi_cycle_recycle` em `execute-scheduled-tasks`: confere na API se a fatura segue em aberto e o mandato ativo, cria a nova CobR, incrementa o contador de reciclo e agenda o próximo passo.
- `woovi_charges`: usar `cycle_index` + contador de reciclo no `raw_payload`, sem tabela nova; `woovi_subscriptions.last_error` continua como trilha de estado.
- `_shared/dunning-whatsapp.ts`: escada intacta, muda só o gatilho. Texto novo exige template aprovado no Twilio; preferência é reaproveitar o aviso genérico já aprovado.
- `customer-portal`: novo branch Woovi lendo `woovi_charges` (`kind: cycle`, sem `paid_at`) para o botão do aviso abrir o PIX do ciclo em aberto.
- Validação: simular `PIX_AUTOMATIC_COBR_REJECTED` no webhook e acompanhar reciclo + tarefas agendadas. `dunning_attempts` ainda não tem registro Woovi em produção.