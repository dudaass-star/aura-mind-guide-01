

# Verificacao Final — Status das Melhorias e Problemas Pendentes

## Status: Todas as melhorias planejadas estao 100% implementadas

| Melhoria | Status |
|----------|--------|
| CTAs em Benefits, Meditations, Comparison | Implementado com `<Link>` + `<Button variant="sage">` |
| CTAs em FAQ, HowItWorks, Demo | Implementado |
| ForWho e Testimonials corrigidos (SPA links) | Implementado com `<Link>` + `<Button>` |
| FinalCTA trust badges | Implementado (Sem fidelidade, Cancele quando quiser, Dados protegidos) |
| StickyMobileCTA | Implementado com IntersectionObserver |
| Exit-intent popup desktop-only | Implementado (`window.innerWidth >= 768`) |
| 3D Secure no trial | Implementado (`request_three_d_secure: 'always'`) |
| Emoji substituido no ThankYou | Implementado (`<BarChart3>`) |

## Problemas encontrados que precisam correcao

### 1. URL canonica errada (impacto SEO)
`Index.tsx` linha 41 tem `<link rel="canonical" href="https://aura.app" />` — o dominio real e `https://olaaura.com.br`. Isso prejudica SEO ao apontar para um dominio inexistente.

### 2. Fallback de dominio no Stripe errado
`create-checkout/index.ts` linha 158 usa `origin || "https://aura.lovable.app"` como fallback. Se o header origin nao vier, o redirect pos-pagamento vai para o dominio do Lovable em vez de `https://olaaura.com.br`. Deveria usar o dominio correto.

### 3. Warnings de ref no console (nao-critico)
O console mostra "Function components cannot be given refs" para `Footer` e `StickyMobileCTA`. Isso ocorre porque o React Router ou algum parent tenta passar ref a esses componentes funcionais. Nao causa erro visivel mas polui o console. Correcao simples com `React.forwardRef`.

---

## Plano de correcao

### Correcao 1 — URL canonica
- **Index.tsx**: Alterar `href="https://aura.app"` para `href="https://olaaura.com.br"`

### Correcao 2 — Fallback do Stripe
- **create-checkout/index.ts**: Alterar fallback de `"https://aura.lovable.app"` para `"https://olaaura.com.br"`

### Correcao 3 — Warnings de ref (opcional)
- **Footer.tsx** e **StickyMobileCTA.tsx**: Envolver com `React.forwardRef` para eliminar warnings do console

---

## Detalhes tecnicos
- 4 arquivos modificados: `Index.tsx`, `create-checkout/index.ts`, `Footer.tsx`, `StickyMobileCTA.tsx`
- 1 edge function para redeploy: `create-checkout`
- Sem mudancas no banco de dados

