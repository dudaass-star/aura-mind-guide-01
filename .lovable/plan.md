
## Resultado do teste mobile (375×812)

Re-testei o fluxo completo: preencheu WhatsApp + Nome + Email → clicou "Começar por R$ 9,90". Funcionou — mas **descobri 3 problemas novos que ainda perdem o usuário no caminho** entre clicar pagar e finalizar.

### Problema A — Sem auto-scroll real para o widget (continua acima da dobra)

Depois do submit, a página fica EXATAMENTE no mesmo scroll. O usuário vê o formulário ainda preenchido, com o CTA verde "Começar por R$ 9,90" ainda visível, e o widget Stripe está bem mais abaixo (uns 1000px). Existe um `scrollIntoView({ block: "start" })` no `requestAnimationFrame`, mas como o bloco do widget é criado **no mesmo frame**, o React ainda não o montou na hora do scroll — o scroll roda antes do elemento existir e não faz nada. Resultado: o usuário não vê o pagamento, pensa "não fez nada", clica de novo ou desiste.

### Problema B — Formulário continua visível abaixo do pagamento (ambiguidade total)

A correção anterior só adicionou `opacity-70 pointer-events-none` no form. O usuário continua vendo TODA a tela anterior (planos, campos preenchidos, CTA "Começar", depoimento da Ana, faixa de garantia) — agora só com opacidade reduzida. Isso é pior que esconder: parece "carregou mas o pagamento não apareceu", e o usuário fica confuso entre dois CTAs ambíguos.

### Problema C — Widget Stripe demora ~3s para carregar, parecendo travado

Mesmo com o skeleton "Carregando pagamento seguro…", em conexões 3G/4G ruins isso vai parecer travado. No preview (iframe aninhado do Lovable), o widget nem carregou em 5s — em produção carrega, mas é um sinal de fragilidade.

## Plano de correção (PR3) — Tela de pagamento dedicada

Manter EmbeddedCheckout (como decidido), mas tratar o pós-submit como **uma tela própria**, não como "form com pagamento embaixo".

### Edição única em `src/pages/CheckoutV2.tsx`

Quando `embeddedClientSecret` existe, **renderizar uma view alternativa**, não o form com opacity:

```text
┌─────────────────────────────┐
│ ← Editar dados              │  ← link pequeno, topo esquerdo
│                             │
│   Confirme e pague          │  ← H1 centralizado
│   Plano Direção • R$ 9,90   │  ← resumo compacto
│   depois R$ 49,90/mês       │
│                             │
│   Preencha o cartão abaixo  │  ← instrução verde
│   para finalizar ↓          │
│                             │
│   ┌───────────────────────┐ │
│   │                       │ │
│   │   [Stripe widget]     │ │  ← topo do widget já visível
│   │                       │ │  ← na primeira tela mobile
│   └───────────────────────┘ │
│                             │
│   🔒 Criptografado          │
│   🛡 Processado pela Stripe │
└─────────────────────────────┘
```

Mudanças concretas:

1. **Renderização condicional via early-return-like**: dentro do `<div className="max-w-xl mx-auto">`, fazer `{embeddedClientSecret ? <PaymentView /> : <FormView />}` — **não exibir os dois ao mesmo tempo**. Form some completamente quando pagamento abre.
2. **Header compacto da PaymentView**: H1 "Confirme e pague" + uma linha "Plano {nome} • R$ {trial} agora • depois R$ {preço}/{período}" + link discreto "← Editar dados".
3. **Instrução "Preencha seu cartão abaixo para finalizar ↓"** em sage, font-display, logo acima do widget.
4. **Widget Stripe no topo da view**: sem o form ocupando 1000px acima, o widget aparece naturalmente perto do topo do viewport mobile. Mantém skeleton enquanto carrega.
5. **Scroll-to-top no submit bem-sucedido**: `window.scrollTo({ top: 0, behavior: "instant" })` ANTES de setar `embeddedClientSecret`, garantindo que a nova view começa do topo.
6. **Esconder o sticky CTA mobile** (já está condicionado em `!embeddedClientSecret`, manter).
7. **Esconder o exit-intent popup** quando estiver na PaymentView (`!embeddedClientSecret` no listener), pra não interromper o pagamento.

### Verificação

Depois de aplicar, rodar de novo em 375×812:
- Preencher tudo → submeter → ver: tela limpa, só pagamento, scroll no topo, skeleton visível e widget montando logo em seguida.
- Clicar "← Editar dados" → form de volta com dados preservados.

### Fora de escopo

- Não mexer em `create-checkout` (backend).
- Não trocar EmbeddedCheckout por hosted (decisão confirmada).
- Métrica `payment_attempted_at` fica pra depois.

### Por que isso resolve a perda

A queda real (de ~40% → ~10%) está concentrada em quem **viu o pagamento mas não submeteu o cartão**. Os Stripe `requires_payment_method` indicam abandono dentro do widget. Reduzir o atrito visual (sumir o form, mostrar só pagamento, scroll já no topo) tira a maior fonte de "perdi a referência do que estou fazendo" que o EmbeddedCheckout introduz.
