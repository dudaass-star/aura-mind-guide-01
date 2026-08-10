# PIX Automático com 1ª semana a R$ 6,90 (igual ao cartão)

## Resposta curta
Sim, dá — e é o formato que a API do PIX Automático já prevê. O QR integrado (Jornada 3) aceita um **valor imediato diferente do valor recorrente**: o cliente paga R$ 6,90 agora e, no mesmo escaneamento, autoriza o débito mensal de R$ 29,90. Hoje o código manda os dois valores iguais, por decisão anterior de risco — não por limitação técnica.

Duas ressalvas honestas:
1. Alguns bancos exibem a autorização de forma mais conservadora quando o 1º valor é muito menor que o recorrente. Isso é comportamento do app do banco, não da Asaas — por isso o plano começa com validação em sandbox antes de virar a chave em produção.
2. O trial semanal continua sendo **1× por cliente** (regra já existente no cartão). Retornante no PIX vai para o valor mensal cheio, sem trial.

## O que muda no fluxo
```text
hoje  → QR de R$ 29,90 + autoriza R$ 29,90/mês (débito começa hoje)
novo  → QR de R$  6,90 + autoriza R$ 29,90/mês (1º débito automático em D+7)
```

- Trial só no ciclo **mensal** (igual ao cartão). Trimestral/Semestral/Anual seguem à vista, sem trial.
- Valores do trial: Essencial R$ 6,90 · Direção R$ 9,90 · Transformação R$ 19,90.
- Como o 1º débito recorrente passa a ser D+7 (e não "hoje"), desaparece de graça o problema da **fatura gêmea do ciclo 1** que hoje exige dedupe.
- Acesso liberado por 7 dias na ativação; na 1ª cobrança recorrente confirmada, estende para o ciclo mensal normal.

## Etapas

### 1. Validação em sandbox (antes de qualquer mudança visível)
Criar uma autorização de teste com valor imediato ≠ recorrente e `startDate = hoje+7`, e confirmar que a Asaas aceita e devolve o QR integrado com os dois valores corretos. Se a Asaas recusar, o plano para aqui e eu reporto — sem mexer no checkout de produção.

### 2. Backend do PIX recorrente
Em `criar-pix-recorrente-asaas`:
- Novo parâmetro `trial` (aceito só quando `billing = monthly`).
- `value` = preço mensal cheio; `immediateQrCode.value` / `originalValue` = preço do trial.
- `startDate` = hoje + 7 dias (mantém `retryPolicy` 3R/7D e o TTL de 24h do QR).
- Bloqueio de retornante idêntico ao do cartão (perfil, Stripe e pagamentos Asaas). Retornante → cai automaticamente no PIX mensal cheio.
- Persistir em `asaas_pix_authorizations` o valor do trial e a flag, para auditoria e para o painel não confundir R$ 6,90 com preço de plano.

### 3. Ativação e validade
Em `webhook-asaas`: quando a ativação vier de uma autorização com trial, `plan_expires_at` = +7 dias (não +31). A 1ª cobrança recorrente confirmada estende para o ciclo mensal. Renovação continua sendo tratada como renovação (não vira venda nova nas métricas).

### 4. Checkout (UI)
Em `CheckoutV2.tsx`: no mensal, o PIX passa a mostrar "R$ 6,90 hoje, depois R$ 29,90/mês no débito automático", igual ao cartão — mesma tarja de preço, mesmo resumo do pedido, mesmo CTA. Nos ciclos longos nada muda.

### 5. Cadência de cobrança e recuperação
Confirmar que o dunning PIX (avisos D+2 / D+4 e escada) trata corretamente a falha do 1º débito pós-trial, que é o momento de maior risco de churn.

## Detalhes técnicos
- Endpoint: `POST /v3/pix/automatic/authorizations`, `paymentCreationMode: SUBSCRIPTION`, QR integrado. `minLimitValue` continua fora (autorização de valor fixo).
- Janela mínima Bacen entre autorização e 1º débito recorrente é de 2 dias; D+7 está confortavelmente dentro.
- Arquivos: `supabase/functions/criar-pix-recorrente-asaas/index.ts`, `supabase/functions/webhook-asaas/index.ts`, `src/pages/CheckoutV2.tsx`, e atualização de `mem/business/trial-only-on-card.md` (a regra deixa de valer).