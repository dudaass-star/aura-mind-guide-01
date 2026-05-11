## Refatorar `/v2/checkout` para alta conversão

Hoje a página tem **6 cards empilhados** (período → planos → destaques → dados → resumo → garantia → CTA + trust), forçando muito scroll no mobile (390px). O objetivo é reduzir fricção visual, manter o usuário focado em **uma decisão por vez** e empurrar o CTA para perto do topo.

### Princípios de conversão aplicados

1. **Uma escolha primária visível**: plano selecionado em destaque com preço grande no topo.
2. **Menos cards, menos bordas**: fundir blocos relacionados; eliminar repetição de preço (hoje aparece 3x).
3. **CTA sempre próximo**: botão "Começar por R$ X" fixo no rodapé do mobile + botão inline.
4. **Reforço de confiança compacto**: garantia + trust badges em uma faixa única, não cards separados.
5. **Reduzir campos visuais**: 3 inputs em um único bloco com labels enxutas.

### Nova estrutura da tela (de cima pra baixo)

```text
┌─────────────────────────────────────┐
│ Header (logo + Voltar)              │
├─────────────────────────────────────┤
│ H1: "Comece em 2 minutos"           │
│ Subhead: 7 dias por R$ X • cancele  │
│         quando quiser               │
├─────────────────────────────────────┤
│ [Mensal | Anual -40%]  toggle pill  │  ← compacto, sem card
├─────────────────────────────────────┤
│ 3 PLANOS — cards horizontais slim   │
│  Essencial · Direção(★) · Transform │  ← seleção via clique no card
│  Cada card: nome, preço trial, "/   │
│  depois R$X/mês", 1 linha highlight │
├─────────────────────────────────────┤
│ FORMULÁRIO (sem header de card)     │
│  Nome • Email • WhatsApp            │
├─────────────────────────────────────┤
│ CTA grande sage rounded-full:       │
│  "Começar por R$ 6,90 →"            │
│  microcopy: "Sem cobrança hoje além │
│   do trial • Cancele em 1 clique"   │
├─────────────────────────────────────┤
│ Faixa única (sem card):             │
│  🛡 Garantia 7d  🔒 Pagamento Stripe│
│  ✓ Cancele quando quiser            │
├─────────────────────────────────────┤
│ Mini-depoimento Ana C. (1 linha)    │
└─────────────────────────────────────┘
+ Sticky CTA fixo no mobile (<768px)
```

### O que sai

- Card "Período de cobrança" como bloco separado → vira **toggle inline** sem moldura.
- Card "Destaques do plano" → highlights vão **dentro do card do plano selecionado** (1–2 bullets, não 3+).
- Card "Resumo" inteiro → o resumo vira **uma linha acima do CTA** ("Hoje R$ 6,90 · depois R$ 29,90/mês"), eliminando duplicação.
- Card "Prova social + garantia" → depoimento vira faixa fina; garantia entra nos trust badges.
- Trust badges em card próprio → faixa única horizontal embaixo do CTA.

### O que ganha (novo)

- **Sticky CTA mobile** (`fixed bottom-0`, só <768px) com preço dinâmico, sumindo quando o form está visível na viewport — reduz abandono no scroll.
- **Microcopy ao redor do CTA**: "Sem cobrança além de R$ X • Cancele em 1 clique no WhatsApp".
- **Selo de urgência leve** no plano "Direção" (mantém "Mais popular") — sem countdown falso.
- **Auto-foco no primeiro campo** ao montar (desktop) para acelerar preenchimento.

### Arquivo editado

**`src/pages/CheckoutV2.tsx`** — rewrite do JSX dentro do `return` mantendo:
- Toda a lógica de estado (`selectedPlan`, `billingPeriod`, `name/email/phone`, validações).
- `handleSubmit` intacto (Meta Pixel + CAPI + GA4 + `create-checkout` + redirect Stripe + `localStorage.aura_checkout`).
- `useEffect` de ViewContent + `trackBeginCheckout`.
- Exit-intent popup atual (já funciona bem, só ajustar copy se necessário).
- Tokens visuais V2 (navy `hsl(220_35%_8%)`, sage `hsl(140_22%_45%)`, glass `bg-white/[0.04]`, `font-display`).

### O que NÃO muda

- `src/pages/Checkout.tsx` (V1) — intacto.
- Edge function `create-checkout`, planos, preços, billing logic.
- Rota `/v2/checkout` e CTAs dos componentes V2.
- Nenhuma migração de banco, nenhuma mudança em GA4/Meta.

### Métricas-alvo (qualitativas)

- Reduzir altura total da página em ~35% no mobile (menos scroll até o CTA).
- CTA visível **sem rolar** após escolher o plano (acima da dobra no iPhone 390x644).
- Resumo de preço aparece **uma única vez** em vez de três.
