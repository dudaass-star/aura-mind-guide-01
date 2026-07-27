## Diagnóstico

O erro que você está vendo é real, mas não deveria aparecer assim para você.

- Seu perfil está ativo no banco: `active / direcao`.
- A tela de cancelamento/dunning consulta o gateway de pagamento para achar uma assinatura ativa ou inadimplente.
- No seu caso de teste, ela não encontra assinatura ativa no gateway e cai em erro genérico ou em estado de reativação.
- Portanto, não é “correto” mostrar erro só porque você está em dia. O correto seria mostrar uma mensagem contextual: você já está ativo, então a oferta de dunning não precisa ser aplicada.

## Plano de correção

### 1. Backend: criar status explícito para usuário já ativo
No `cancel-subscription`, quando a função encontrar o perfil e ele estiver saudável no banco (`status = active`, sem `payment_failed_at` recente crítico), mas não encontrar assinatura no gateway:

- Se o link veio de dunning/oferta, retornar algo como:
  - `success: true`
  - `status: "already_active"`
  - `message: "Sua assinatura já está ativa. Essa oferta era para reativação e não precisa ser aplicada agora."`
  - dados mínimos do perfil/plano
- Não retornar `no_gateway_subscription` nesse caso.
- Manter `no_gateway_subscription` para usuários realmente inativos/cancelados/inadimplentes sem assinatura encontrada, pois aí a reativação por checkout faz sentido.

### 2. Frontend: mostrar tela amigável para `already_active`
No `CancelSubscription.tsx`:

- Adicionar tratamento para `status === "already_active"`.
- Mostrar um card positivo, não vermelho, dizendo que a assinatura já está ativa.
- Oferecer CTA para voltar ao portal/meu espaço ou falar com suporte.
- Não mostrar CTA de reativação nem “Tentar novamente”.

### 3. Preservar fluxo real de dunning
Para clientes reais em dunning:

- `past_due` continua abrindo recuperação.
- `canceling`/`paused` continuam com suas mensagens específicas.
- `no_gateway_subscription` continua existindo para casos de reativação real quando o perfil não está ativo.
- As ofertas Lite/Base/30% continuam funcionando quando fizerem sentido.

### 4. Reteste
Depois da alteração:

- Testar seu número com o link de oferta.
- Confirmar que aparece “assinatura já ativa” em vez de erro.
- Testar um payload simulado sem gateway e com perfil não ativo para garantir que a reativação ainda aparece.