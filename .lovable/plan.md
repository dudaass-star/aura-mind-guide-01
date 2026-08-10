# Mercado Pago como alternativa ao PIX: o que a API deles realmente permite

## Resposta direta

Verifiquei a documentação e a API do Mercado Pago. **A recorrência do Mercado Pago (`/preapproval` e `/preapproval_plan`) é de cartão, não de PIX Automático Bacen.**

Evidências:
- `POST /preapproval` (Assinaturas com pagamento autorizado) exige `card_token_id` para autorizar o débito; o meio de pagamento da assinatura é o cartão salvo.
- `POST /preapproval_plan` tem `payment_methods_allowed.payment_types`, e todos os exemplos e valores documentados são bandeiras de cartão (`visa`, etc.). Não há `pix` como meio de recorrência.
- Não existe endpoint público de autorização PIX Automático na referência do Mercado Pago (nada equivalente a `/pix/automatic/authorizations` do Asaas). `GET /preapproval` responde na API, mas o recurso é o mesmo de cartão.
- O que existe no Mercado Pago para PIX é **cobrança avulsa** (QR dinâmico, via Orders/Payments). O material que fala de PIX Automático é conteúdo de blog explicando a modalidade do Bacen — não documentação de API do produto deles.

Ou seja: **trocar Asaas por Mercado Pago não substitui o PIX Automático.** Viraria PIX manual a cada ciclo (novo QR + cobrança + aviso), que é exatamente o modelo de churn que abandonamos. Como PIX à vista e como contingência, o Mercado Pago é ótimo. Como recorrência automática, não serve hoje.

## Quem realmente tem PIX Automático em API

Além do Asaas, encontrei documentação pública de PIX Automático Bacen com endpoints próprios em:
- **Woovi** — API de PIX Automático documentada (`pixRecurring`, `recurrencyId`, jornadas incluindo autorização no ato do pagamento), atualizada recentemente.
- **Iugu** — cobranças recorrentes por API com PIX Automático.

Esses são os candidatos reais para um segundo trilho **com paridade de recorrência**. O Mercado Pago entra como reforço de conversão no PIX avulso, não como substituto do Asaas.

## Contexto que motivou tudo isso (verificado)

- `ASAAS_API_KEY` autentica (`GET /finance/balance` → 200, saldo R$ 289,29), mas todo endpoint operacional devolve **401 com corpo vazio** (`/payments`, `/customers`, `/subscriptions`, `/pix/addressKeys`, `/pix/automatic/authorizations`, `/myAccount`, `/webhooks`). Chave inválida devolveria `invalid_access_token` — logo é conta restrita, não credencial errada.
- Último pagamento Asaas no banco: **05/08/2026 23:14**. O trilho PIX está parado há 5 dias.

## Recomendação em duas frentes

### Frente A — Contingência rápida: Mercado Pago só como PIX à vista
Serve para voltar a vender PIX hoje, sem prometer recorrência que a API deles não entrega.

1. **Camada de provedor PIX** — `supabase/functions/_shared/pix-provider.ts` com uma interface única (`criarCobranca`, `criarAutorizacaoRecorrente`, `consultar`) e implementações por provedor. Seleção por `system_config.pix_provider` (`asaas` | `mercadopago` | `auto`).
2. **`criar-pix-mercadopago`** — cria pagamento PIX (QR + copia-e-cola), grava no mesmo formato de `asaas_payments` para painel e dunning não precisarem de caso especial. O trial de R$ 6,90 funciona naturalmente (cobra 6,90 hoje), mas o próximo ciclo é cobrança emitida, não débito automático.
3. **`webhook-mercadopago`** — valida assinatura, trata `payment.updated`, reaproveita a lógica de ativação/renovação já existente no `webhook-asaas`, com dedupe por `external_reference`.
4. **`asaas-health-check`** — testa o par `balance 200` + `payments 401`, grava `system_config.asaas_blocked`, alerta o ADMIN_ALERT_EMAIL e, no modo `auto`, redireciona o PIX. O problema atual passou 5 dias invisível; isso não pode repetir.
5. **Checkout** — `CheckoutV2.tsx` lê o provedor ativo e chama a função certa; no modo PIX à vista, o texto do ciclo seguinte muda para "você recebe o PIX do próximo mês no WhatsApp", sem prometer débito automático.

### Frente B — Segundo trilho com PIX Automático de verdade (avaliação)
Antes de codar: abrir conta e validar em sandbox na **Woovi** (primeira opção, API mais explícita) qual jornada de autorização eles suportam e se aceitam **valor imediato diferente do recorrente** — o requisito do nosso trial de R$ 6,90 + R$ 29,90/mês. Com isso confirmado, a mesma camada da Frente A recebe o adaptador e o PIX Automático deixa de depender de um único provedor.

### Em paralelo
Seguir pressionando o desbloqueio do Asaas (pendência cadastral no painel + atendimento humano de compliance). Se voltar, ele continua como trilho principal e o resto vira redundância — o que é exatamente o objetivo.

## Detalhes técnicos
- Novos secrets: `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `MERCADOPAGO_ENV` (e, na Frente B, as credenciais do provedor escolhido).
- Arquivos novos: `_shared/pix-provider.ts`, `criar-pix-mercadopago/`, `webhook-mercadopago/`, `asaas-health-check/`.
- Ajustes: `criar-pix-recorrente-asaas`, `webhook-asaas`, `asaas-pix-auto-audit`, `_shared/dunning-whatsapp.ts`, `src/pages/CheckoutV2.tsx`.
- Nada disso toca o trilho de cartão (Stripe).
