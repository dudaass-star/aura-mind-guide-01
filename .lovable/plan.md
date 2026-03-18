

## Concordo 100%. Uma tela única é melhor.

Ter duas telas separadas (StartTrial e Checkout) cria confusão e duplicação de código. Unificar faz sentido porque:
- O fluxo é o mesmo: escolher plano → preencher dados → ir pro Stripe
- A diferença é só que **todo mundo ganha 7 dias grátis** (trial sempre ativo)
- Simplifica manutenção e UX

---

## Plano de implementação

### 1. Unificar na página `/checkout` (`src/pages/Checkout.tsx`)

**Mudanças visuais:**
- Adicionar um **banner/badge** destacado no topo: "✨ 7 dias grátis em todos os planos — primeira cobrança só no 8º dia"
- Em cada card de plano, mostrar o preço com a nota "Comece grátis por 7 dias"
- No resumo (seção de total), reforçar: "Hoje: R$ 0,00 — Primeira cobrança em 7 dias: R$ XX,XX"
- Botão de submit: "Começar 7 dias grátis" (em vez de "Continuar para pagamento")

**Mudança no submit:**
- Sempre enviar `trial: true` no body para o `create-checkout`:
```typescript
body: {
  plan: selectedPlan,
  billing: billingPeriod,
  trial: true,  // sempre trial
  name, email, phone,
}
```

### 2. Atualizar `create-checkout` Edge Function

- **Remover** a lógica que força `essencial` quando `trial=true` (linha 48: `const plan = trial ? "essencial" : requestedPlan`)
- Permitir trial em qualquer plano — o trial de 7 dias se aplica ao plano que o usuário escolheu
- Manter o `trial_period_days: 7` e a `description` que já adicionamos

### 3. Atualizar links do site

- Todos os CTAs que apontam para `/experimentar` passam a apontar para `/checkout`:
  - `Hero.tsx` (linha 111)
  - `Demo.tsx` (linha 508)
  - `ForWho.tsx` (linha 79)
  - `FinalCTA.tsx` (linha 27)
  - `Testimonials.tsx` (linha 201)

### 4. Redirecionar `/experimentar` → `/checkout`

- Manter a rota `/experimentar` mas redirecionar para `/checkout` (para não quebrar links existentes/compartilhados)
- Ou simplesmente fazer `StartTrial.tsx` renderizar um `<Navigate to="/checkout" />`

### 5. Ajustar `cancel_url` no backend

- Atualizar de `${origin}/experimentar` para `${origin}/checkout` no `create-checkout` (linha 149)

---

## Resumo das mudanças

| Arquivo | O quê |
|---------|-------|
| `src/pages/Checkout.tsx` | Banner "7 dias grátis", enviar `trial: true`, botão atualizado |
| `supabase/functions/create-checkout/index.ts` | Remover forçar essencial no trial, permitir qualquer plano com trial |
| `src/components/Hero.tsx` | Link → `/checkout` |
| `src/components/Demo.tsx` | Link → `/checkout` |
| `src/components/ForWho.tsx` | Link → `/checkout` |
| `src/components/FinalCTA.tsx` | Link → `/checkout` |
| `src/components/Testimonials.tsx` | Link → `/checkout` |
| `src/pages/StartTrial.tsx` | Redirect para `/checkout` |

