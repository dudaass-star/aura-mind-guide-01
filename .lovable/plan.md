# Forçar BRL e pt-BR no Embedded Checkout

## O que está acontecendo

O teste do fluxo refeito mostrou 2 resultados:

1. **A reestruturação do PaymentView está perfeita.** Form some completamente quando o widget abre, header "Confirme e pague" claro, plano resumido no topo, link discreto "← Editar dados", Stripe carrega rápido. Sem ambiguidade, sem dois CTAs.

2. **Apareceu um bloco verde "Escolha uma moeda: US$ 2,05 / R$ 9,90"** e o País defaultou para "Estados Unidos". Isso é o **Adaptive Pricing** da Stripe — uma feature ligada na conta (provavelmente ativada por padrão em alguma atualização recente). Ela detecta IP/locale do browser e oferece conversão automática. Como o preview da Lovable roda em IP US, ela aparece. **Não é bug do nosso código.**

Mesmo assim é ruim pro usuário brasileiro real: adiciona 1 passo cognitivo a mais ("qual moeda eu escolho?"), confunde, e em alguns browsers o default pode vir USD.

## O que vou fazer (mudança cirúrgica)

Editar **apenas** o arquivo `supabase/functions/create-checkout/index.ts`:

### Adicionar em todos os `sessionConfig` do modo embedded:
- `adaptive_pricing: { enabled: false }` — desliga o seletor de moeda. Stripe sempre cobra em BRL.
- `locale: "pt-BR"` — força a UI do widget inteiro em português, dropdown de País já abre com "Brasil" no topo.

Esses 2 campos são oficiais da Stripe Checkout Session API e não exigem nenhuma config no Dashboard.

### Não vou mexer em:
- Nada de frontend (`CheckoutV2.tsx` está bom).
- Nada de Stripe Dashboard.
- Nada de RLS, autenticação, ou outros edge functions.

## Validação após implementar

Vou refazer o fluxo no mobile (375×812):
1. Clicar no CTA do plano → ir para `/checkout-v2`
2. Preencher form e submeter
3. Confirmar que o widget abre **direto em BRL**, sem o bloco verde de seleção de moeda
4. Confirmar que País/região já vem "Brasil"
5. Screenshot final

Se mesmo com `adaptive_pricing.enabled=false` o seletor persistir (caso raro de feature obrigatória em alguma versão da API), volto e reporto — não tento "force-fix" por outros caminhos.

## Por que essa é a solução certa

- **Mínimo invasivo:** 2 linhas em 1 arquivo backend.
- **Resolve o ruído real:** usuário brasileiro vê 1 moeda, 1 preço, 1 caminho.
- **Não inventa problema:** o restante do fluxo (Confirme e pague + skeleton + scroll-to-top + form oculto) já validei que funciona.
- **Independente do Dashboard:** a config por sessão sobrescreve a config da conta, então mesmo que a Stripe ligue/desligue Adaptive Pricing globalmente, nosso checkout fica estável.
