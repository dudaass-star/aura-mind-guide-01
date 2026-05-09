# V2 da Landing Aura — `/v2`

## Princípios
- **70% emoção, 30% explicação.** Cada seção sente antes de explicar.
- **Tema escuro isolado nesta rota.** Home `/`, checkout, portal e admin permanecem como hoje.
- **Conversas são o herói**, não as features.
- **Menos blocos, mais respiro.** Tipografia maior, mais silêncio entre seções.
- **CTA único e recorrente:** `Começar por R$ 6,90` → `/checkout` (mesma rota da home atual, preserva tracking GA4 + Meta Pixel).

## Estrutura da página (ordem)

```text
1. Hero cinematográfico        — identificação imediata
2. Espelho emocional            — "tem gente que parece normal por fora..."
3. Conversas reais (herói)     — 4 cenas Usuário ↔ Aura
4. Transformações (não features)— 3 cards reescritos em linguagem emocional
5. Comparação com terapia       — versão enxuta da seção atual
6. Prova social                 — 3 depoimentos curtos, sem cards pesados
7. Planos                       — versão simplificada do Pricing
8. FAQ enxuto (4 perguntas)     — só objeções críticas
9. Fechamento emocional         — "tem noites em que sua mente pesa demais..."
```

## Conteúdo por seção

### 1. Hero
- **Headline:** "Quando sua mente acelera, a Aura responde."
- **Sub:** "Converse, descarregue pensamentos e reorganize sua mente — direto no WhatsApp."
- **CTA:** "Começar por R$ 6,90" + microcopy "7 dias por R$ 6,90 · Cancele quando quiser."
- **Visual:** fundo escuro `hsl(220 25% 8%)`, glow sage difuso atrás do título, vídeo `aura-intro.mp4` reaproveitado mas com moldura escura e overlay sutil. Animação de fade-up lenta (1.2s).

### 2. Espelho emocional (nova)
- Frase grande: "Tem gente que parece normal por fora — mas está lutando contra a própria mente todos os dias."
- Lista vertical com 6 itens em tipografia média, sem ícones coloridos, só um ponto luminoso à esquerda:
  overthinking · ansiedade silenciosa · exaustão mental · sensação de vazio · pensamentos em loop · noites sem desligar a mente.

### 3. Conversas reais (herói da página)
- Mock de WhatsApp em tela cheia, escuro, com 4 cenas em scroll/fade:
  1. "Minha mente não para." → "Você está carregando mais do que consegue processar sozinho."
  2. "São 3h da manhã e a ansiedade bateu." → "Eu tô aqui. Respira comigo — me conta o que tá te tirando o sono."
  3. "Hoje eu nem sei como eu tô." → "Tudo bem não saber. A gente descobre junto, sem pressa."
  4. "Acho que tô me afastando de mim mesmo." → "Isso que você acabou de falar é mais lúcido do que parece."
- Animação de typing entre bolhas (reaproveita `animate-typing-dot` que já existe).

### 4. Transformações (substitui Benefits atual)
- 3 cards verticais grandes, fundo `hsl(220 22% 12%)`, borda sutil, glow no hover:
  - "A Aura lembra de quem você é. Mesmo nos dias em que você esquece."
  - "3h da manhã. A ansiedade bateu. A Aura responde."
  - "Fale do jeito que conseguir. Texto, áudio, frase solta. A Aura entende."

### 5. Comparação com terapia
- Versão visualmente enxuta do `<Comparison />` atual, repaginada para o tema escuro. Mantém a tabela mas remove cards laterais.

### 6. Prova social
- 3 depoimentos curtos (1-2 linhas cada) em layout horizontal, sem foto, só nome + cidade. Reaproveita dados de `<Testimonials />`.

### 7. Planos
- Versão enxuta de `<Pricing />`: 3 cards lado a lado, destaque central no Direção, mesmos preços e CTAs.

### 8. FAQ
- 4 perguntas críticas (Accordion já existente):
  - Como funciona o trial de R$ 6,90?
  - Posso cancelar quando quiser?
  - É terapia? Substitui psicólogo?
  - Meus dados ficam seguros?

### 9. Fechamento emocional
- Tela escura, tipografia grande:
  > "Tem noites em que sua mente pesa demais.
  > A Aura foi criada para esses momentos."
- CTA final: "Começar por R$ 6,90".

## Implementação técnica

### Rota
- Adicionar rota `/v2` em `src/App.tsx` apontando para nova `src/pages/IndexV2.tsx`.
- Home `/` permanece intacta.

### Estrutura de arquivos
```text
src/pages/IndexV2.tsx                — page wrapper, Helmet com canonical /v2 + noindex
src/components/v2/
  HeroV2.tsx
  EmotionalMirror.tsx
  ConversationShowcase.tsx
  TransformationsV2.tsx
  ComparisonV2.tsx        (wrapper escuro do Comparison atual)
  TestimonialsV2.tsx
  PricingV2.tsx
  FAQV2.tsx
  FinalCTAV2.tsx
  HeaderV2.tsx            (header escuro, mesmos links)
  FooterV2.tsx            (footer escuro)
src/styles/v2-theme.css   — escopo `.theme-v2` com tokens escuros
```

### Tema escuro escopado (não global)
- Criar `src/styles/v2-theme.css` com bloco `.theme-v2 { --background: 220 25% 8%; --foreground: 30 25% 95%; --card: 220 22% 12%; --primary: 155 40% 60%; --muted-foreground: 220 10% 65%; --border: 220 15% 20%; ... }`.
- Em `IndexV2.tsx`, aplicar `<div className="theme-v2 bg-background text-foreground">` no root.
- Tokens semânticos do shadcn (`bg-background`, `text-foreground`, `bg-card`, etc.) reagem automaticamente — zero classe `text-white`/`bg-black` hardcoded.
- Importar o CSS uma única vez em `IndexV2.tsx` (não em `main.tsx`) para não vazar para outras rotas.

### Tracking
- Mesmos eventos GA4 (`trackCtaClick`, `trackViewItem`) com `item_id: "landing_v2"` para diferenciar nas métricas.
- Meta Pixel `ViewContent` com `content_category: "homepage_v2"`.
- CTAs apontam para `/checkout` (preserva todo o funil Stripe atual).

### SEO
- `<meta name="robots" content="noindex, nofollow">` enquanto for página de teste.
- Canonical aponta para `/` para não competir.

### Reutilização
- Vídeo `/videos/aura-intro.mp4` reaproveitado no Hero.
- Componentes shadcn (`Button`, `Accordion`, `Card`) reutilizados — só mudam tokens.
- Fontes Fraunces + Nunito mantidas (já carregadas globalmente).

### Sticky CTA mobile
- Versão escura do `<StickyMobileCTA />` para `/v2`, mesmo comportamento.

## Fora de escopo (não fazemos agora)
- A/B test automático ou redirect 50/50.
- Refator do design system global.
- Novos vídeos ou imagens geradas por IA (usamos os assets atuais).
- Mudanças no checkout, portal, admin.

## Como você valida
- Acesse `/v2` em desktop e mobile.
- Compare lado a lado com `/`.
- CTA final: decidir se promove para `/` (substituir) ou mantém em paralelo coletando dados.
