

# Auditoria Completa do Funil AURA — Landing Page, Checkout e Stripe

## Status das Melhorias Anteriores

Todas as melhorias planejadas foram implementadas corretamente:
- CTAs em Benefits, Meditations, Comparison — usando `<Link>` + `<Button variant="sage">`
- ForWho e Testimonials — corrigidos de `<a href>` para `<Link>`
- FinalCTA — trust badges (Sem fidelidade, Cancele quando quiser, Dados protegidos)
- StickyMobileCTA — funcional com IntersectionObserver no hero-section
- Hero tem `id="hero-section"` para o observer

## Problemas Encontrados por Etapa

### Landing Page — Pequenos Ajustes

**1. FAQ sem CTA ao final (impacto médio)**
Após 9 perguntas respondidas, o lead fica convicto mas precisa scrollar até o FinalCTA. Oportunidade perdida — um CTA logo após as FAQs captura quem acabou de ter suas objeções eliminadas.

**2. HowItWorks sem CTA (impacto baixo-médio)**
A seção "Como funciona" termina sem oferecer ação. Após entender o processo, o lead pode querer agir imediatamente.

**3. Demo sem CTA ao final (impacto médio)**
A conversa simulada é altamente persuasiva (523 linhas de demo interativa), mas termina sem botão. O lead fica emocionalmente engajado sem caminho direto para conversão.

**4. ThankYou mostra emoji 📊 (inconsistência menor)**
Linha 89: `📊 Você também receberá...` — deveria usar ícone Lucide para consistência.

### Checkout — Oportunidades de Otimização

**5. Checkout não passa `plan` e `billing` via URL quando vem de CTAs genéricos (impacto médio)**
Os CTAs "Começar por R$ 6,90" nas seções Benefits, Meditations, Comparison, FinalCTA linkam para `/checkout` sem parâmetros. O checkout abre com o plano "Direção" (default), ignorando a intenção do lead. Os CTAs do Pricing passam via `state`, mas CTAs genéricos não.

**6. Falta 3DS explícito no trial checkout (impacto na conversão)**
A memória técnica diz que o sistema usa `request_three_d_secure: 'always'`, mas o código do `create-checkout` NÃO configura isso. A `payment_method_options.card` só tem `setup_future_usage: 'off_session'` — falta o `request_three_d_secure`.

**7. Checkout exit popup usa `visibilitychange` (pode irritar no mobile)**
No mobile, trocar de app (ex: copiar número do cartão) dispara o popup. O `visibilitychange` deveria ser desabilitado no mobile ou ter um delay.

### Stripe Checkout (Página do Stripe)

**8. Nome do produto no Stripe poderia ser mais claro**
Atualmente: `AURA Direção — 7 dias | Após: R$ 49,90/mês` — está bom, mas a descrição é apenas `CANCELE QUANDO QUISER.` em caps lock. Poderia ser mais persuasiva sem ser gritante.

**9. `success_url` usa domínio hardcoded como fallback**
Linha 158: `origin || "https://aura.lovable.app"` — se o header origin não vier, redireciona para o domínio do Lovable em vez do domínio publicado. Deveria usar o domínio correto.

---

## Plano de Melhorias (Priorizado)

### Prioridade 1 — CTAs ausentes nas seções finais
- **FAQ.tsx**: Adicionar CTA "Começar por R$ 6,90" após o Accordion
- **Demo.tsx**: Adicionar CTA ao final da seção de demo
- **HowItWorks.tsx**: Adicionar CTA ao final
- Todos usando `<Link to="/checkout"><Button variant="sage" size="xl">`

### Prioridade 2 — Fix do exit popup no mobile
- **Checkout.tsx**: Desabilitar o listener `visibilitychange` em viewports mobile (usar `window.innerWidth < 768` como guard)

### Prioridade 3 — Consistência visual
- **ThankYou.tsx**: Substituir emoji 📊 por `<BarChart3>` ou `<LayoutDashboard>` do Lucide

### Prioridade 4 — 3DS no Stripe (se confirmado)
- **create-checkout/index.ts**: Adicionar `request_three_d_secure: 'always'` em `payment_method_options.card` no modo trial

---

## Detalhes Técnicos
- 5 arquivos modificados: `FAQ.tsx`, `Demo.tsx`, `HowItWorks.tsx`, `Checkout.tsx`, `ThankYou.tsx`
- Opcionalmente 1 edge function: `create-checkout/index.ts` (3DS)
- Sem mudanças no banco de dados
- Todas as dependências já existem

