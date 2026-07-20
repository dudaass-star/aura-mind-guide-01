## Contexto verificado

Fluxo atual quando o retornante tenta Semanal (Stripe cartão **ou** Asaas cartão):

1. Backend responde `409 WEEKLY_NOT_AVAILABLE_FOR_RETURNING` com a mensagem: *"O Plano Semanal é só pra primeira experiência. Como você já assinou antes, escolha um dos planos recorrentes..."* e `suggestedBilling: "monthly"`.
2. Frontend (`CheckoutV2.tsx` + `AsaasCardForm.tsx`) já:
   - Dispara `toast.info(...)` por 7s.
   - `setBillingPeriod("monthly")`.
   - Rola pro topo.

**Gaps encontrados:**
- É um `toast.info` de 7s que some — se o usuário estiver olhando o botão "Pagar" no meio da tela, pode não ver e achar que "deu erro e não vai" na segunda tentativa.
- Nada visualmente destaca que o plano mudou (o seletor de billing só troca de estado sem callout).
- No fluxo Asaas, `handleResetCheckout()` fecha o form embutido: o usuário volta pro formulário mas sem contexto explícito do porquê.
- Não há aviso preventivo — o usuário só descobre depois de clicar "Pagar".

## O que fazer

**1. Banner inline persistente (substitui o toast como fonte primária)**
- Novo estado `weeklyBlockedNotice` em `CheckoutV2.tsx`.
- Quando o 409 chega (Stripe cartão ou Asaas cartão), setar o aviso com o texto do backend.
- Renderizar um card destacado (tom "info", não "erro") no topo do formulário: ícone de info + título "Mudamos pra Mensal automaticamente" + corpo com a mensagem do backend + CTA "Continuar com Mensal" que rola até o botão Pagar.
- Some ao trocar plano/billing manualmente ou ao submeter com sucesso.
- Manter o `toast.info` como reforço (curto), mas o banner é o que garante que não parece erro.

**2. Destacar visualmente a troca**
- Ao setar `billingPeriod = "monthly"`, aplicar um highlight temporário (ring/animação de 2s) no card do plano Mensal.
- Atualizar o subtítulo do checkout dinamicamente ("7 dias por R$ X" → "Mensal • R$ Y/mês") pra reforçar que a UI já se ajustou.

**3. Copy defensiva antes de submeter (opcional, leve)**
- Se o usuário estiver com Semanal selecionado e já tiver preenchido email + telefone válidos, exibir um hint discreto abaixo do seletor: "Já assinou antes? O Semanal é só pra 1ª experiência."
- Sem chamada de rede — só mensagem informativa. Evita frustração antes do clique.

**4. Preservar o fluxo do Asaas embutido**
- No `onWeeklyBlocked` do `AsaasCardForm`, além do reset + scroll: setar o mesmo `weeklyBlockedNotice` para que, ao voltar ao formulário, o banner explique o motivo do form ter sido fechado.

## Arquivos afetados

- `src/pages/CheckoutV2.tsx` — novo estado `weeklyBlockedNotice`, banner, highlight, subtítulo dinâmico, hint opcional, wiring do `onWeeklyBlocked`.
- Sem mudanças de backend, sem mudanças de contrato de API.

## Fora de escopo

- Pré-checagem via endpoint dedicado (evitar round-trip extra e complexidade).
- Auto-submit após a troca — o usuário precisa revisar e confirmar o novo valor (Mensal cobra mais que Semanal na 1ª cobrança).
- Fluxo PIX (não oferece Semanal).
