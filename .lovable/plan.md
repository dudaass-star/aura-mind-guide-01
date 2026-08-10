# Mercado Pago como alternativa ao PIX do Asaas

## Onde estamos (verificado agora)

- A chave `ASAAS_API_KEY` **autentica** (`GET /finance/balance` → 200, saldo R$ 289,29), mas todo endpoint operacional responde **401 com corpo vazio** (`/payments`, `/customers`, `/subscriptions`, `/pix/addressKeys`, `/pix/automatic/authorizations`, `/myAccount`, `/webhooks`). Chave inválida devolveria `invalid_access_token` — não é o caso. Isso é conta restrita, não credencial errada.
- Último pagamento Asaas registrado: **05/08/2026 23:14**. Nada depois. O trilho PIX está fora do ar há 5 dias.

Conclusão: hoje temos **um único trilho de PIX e ele é um ponto único de falha**. Independente de o Asaas voltar, ter um segundo provedor é a decisão certa.

## Avaliação honesta do Mercado Pago

**A favor**
- Marca de confiança altíssima no PIX brasileiro — bom para conversão.
- PIX avulso (QR dinâmico) é maduro, estável e barato; risco operacional baixo.
- Conta e reputação independentes do Asaas: um bloqueio não derruba o outro.

**Contra / a confirmar antes de decidir**
- O ponto crítico é **PIX Automático (Bacen)** — o débito recorrente sem novo QR. Não consigo confirmar por documentação pública que o Mercado Pago já exponha isso em API para a nossa conta; a rota de recorrência deles (`/preapproval`) nasceu para cartão e saldo em conta. Sem PIX Automático, o Mercado Pago vira **PIX manual recorrente** (cobrança + aviso todo ciclo), que é exatamente o modelo que abandonamos por churn.
- Trocar de provedor **não migra as autorizações Bacen existentes**. Quem já autorizou no Asaas teria que reautorizar no novo provedor — atrito real com a base ativa.
- Duplicar provedor duplica o que já dói: webhook, dedupe de fatura, dunning PIX (D+2/D+4), reconciliação de órfãos e auditoria diária.

Portanto **não recomendo "colocar no lugar de"**. Recomendo **colocar ao lado**: Mercado Pago entra como trilho de contingência e, se confirmar PIX Automático, é promovido a padrão.

## Plano

### Etapa 0 — Confirmar a capacidade antes de escrever código (bloqueante)
Criar conta/aplicação Mercado Pago e responder, com evidência de API, uma pergunta só: **existe débito recorrente PIX Automático Bacen disponível para a nossa conta?**
- Se **sim** → seguimos para paridade total (etapas 1 a 4).
- Se **não** → o Mercado Pago entra apenas como PIX à vista (mensal e ciclos longos), e a recorrência automática continua dependendo do Asaas voltar.

Sem essa resposta, qualquer implementação corre risco de virar retrabalho. Preciso que você crie a conta e me passe as credenciais de teste para eu validar.

### Etapa 1 — Camada de provedor PIX
Criar `supabase/functions/_shared/pix-provider.ts` com uma interface única (`criarCobranca`, `criarAutorizacaoRecorrente`, `consultar`) e duas implementações: `asaas` e `mercadopago`. Escolha por `system_config.pix_provider` (`asaas` | `mercadopago` | `auto`), com `auto` caindo no Mercado Pago quando o Asaas estiver bloqueado.

### Etapa 2 — Mercado Pago: cobrança e webhook
- `criar-pix-mercadopago`: cria pagamento PIX, devolve QR + copia-e-cola, persiste em uma tabela espelho de `asaas_payments` (mesmo formato de campos, para o painel e o dunning não precisarem de caso especial).
- `webhook-mercadopago`: valida assinatura, trata `payment.updated`, ativa/renova o plano reaproveitando a mesma lógica de ativação já usada no `webhook-asaas` (fonte única de verdade), com dedupe por `external_reference`.
- Trial semanal de R$ 6,90: no PIX à vista sai naturalmente (cobra 6,90 hoje); só faz sentido manter o débito automático em D+7 se a Etapa 0 confirmar PIX Automático.

### Etapa 3 — Checkout e detecção de indisponibilidade
- `CheckoutV2.tsx` passa a ler o provedor ativo e chamar a função correta; o cliente não vê diferença.
- Health-check diário (`balance` 200 + `payments` 401 = bloqueado) grava `system_config.asaas_blocked` e, no modo `auto`, redireciona o PIX para o Mercado Pago sem intervenção. Alerta por e-mail para o ADMIN_ALERT_EMAIL na virada — o problema atual passou 5 dias invisível.

### Etapa 4 — Dunning e reconciliação
Estender `_shared/dunning-whatsapp.ts` e a auditoria diária para reconhecer pagamentos Mercado Pago, mantendo a cadência atual (2 avisos → escada de ofertas) e a varredura de órfãos por API.

### Em paralelo, sem depender disso
Continuar a pressão pelo desbloqueio do Asaas (pendência cadastral no painel e atendimento humano de compliance). Se ele voltar, o Mercado Pago fica como contingência ativa em vez de virar trabalho jogado fora.

## Detalhes técnicos
- Novos secrets: `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `MERCADOPAGO_ENV`.
- Arquivos: `_shared/pix-provider.ts` (novo), `criar-pix-mercadopago/` (novo), `webhook-mercadopago/` (novo), `asaas-health-check/` (novo), e ajustes em `criar-pix-recorrente-asaas`, `webhook-asaas`, `asaas-pix-auto-audit`, `_shared/dunning-whatsapp.ts`, `src/pages/CheckoutV2.tsx`.
- Nada disso toca o trilho de cartão (Stripe).
