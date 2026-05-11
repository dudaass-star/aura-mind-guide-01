## Objetivo

Substituir o V2 atual (dark cinematográfico) por um estilo "editorial acolhedor": hero com foto real (mulher no sofá com celular, luz âmbar), seções alternando claro (creme) e escuro (navy), título serif "Presente quando sua mente precisa", sage/verde-oliva como cor de ação. V1 (/) fica intacto.

## Direção visual

- **Paleta** (tokens novos no `v2-theme.css`):
  - `--background` creme quente (~`30 25% 96%`)
  - `--foreground` navy profundo (~`220 35% 12%`)
  - `--primary` sage (~`130 18% 55%`) com versão escura para botão sólido
  - Seções escuras: navy `220 35% 10%` com texto creme
  - Accent lavanda discreta (bolha/coração)
- **Tipografia**: serif elegante (Fraunces ou Instrument Serif via Google Fonts) para H1/H2; Inter pro corpo. Mantém `font-display` apontando pra serif só dentro de `.theme-v2`.
- **Componentes-chave**: badge pill ("✓ Acompanhamento emocional no WhatsApp"), botão sage arredondado grande, mockup WhatsApp com bolhas verde-claro/branco e header "AURA online agora", cards de depoimento com foto redonda + nome + idade, card "Experimente sem risco" com selo.

## Estrutura da página (mistura das 2 refs)

1. **HeaderV2** — logo + nav (Como funciona, Recursos, Depoimentos, Planos, Perguntas) + CTA sage "Começar por R$ 6,90" com microcopy "7 dias por R$ 6,90".
2. **HeroV2** — split: esquerda título serif + subtítulo + CTA + 3 trust badges (4.9/5, 24/7, Memória de longo prazo); direita foto IA da mulher com bolha de chat sobreposta. Fundo navy.
3. **HowItWorksV2** (img1) — 3 passos numerados em círculos sage, fundo creme.
4. **ChatPreviewV2** (img1+2) — split: texto "Profundo como uma sessão de verdade" + mockup WhatsApp completo com 4 bolhas reais e CTA "Ver conversa completa".
5. **BenefitsGridV2** (img2) — fundo navy, grade 3×2 de ícones + título + 1 linha (Disponível 24/7, Memória de longo prazo, Sessões especiais 45min, Resumo escrito, Nunca te abandona, Pausa quando precisar).
6. **TestimonialsV2** — 3 cards creme com aspas, foto redonda, nome + idade. Reaproveitar Juliana/Carlos/Ana do V1.
7. **PricingV2** — bloco sage com card "Experimente sem risco" (selo + checklist + CTA escuro). Mantém os 3 planos atuais ou só o teaser de 7 dias com link pra `/checkout`.
8. **FAQV2** — accordion 2 colunas, fundo creme. Reaproveita perguntas do V2 atual.
9. **FinalCTAV2** — fundo navy, ícone coração circular à esquerda, "Você não precisa enfrentar tudo sozinho" + CTA sage.
10. **FooterV2** — mantém atual, ajusta cores.
11. **StickyMobileCTAV2** — mantém comportamento, ajusta para sage sólido.

## Conteúdo

- **Copy/preços/depoimentos**: 100% reaproveitados do V1/V2 atuais (planos R$ 29,90/49,90/79,90, trial R$ 6,90, depoimentos Juliana/Carlos/Ana).
- **Headlines**: usar das refs ("Presente quando sua mente precisa", "Profundo como uma sessão de verdade", "Por menos de R$ 1,00 por dia", "Você não precisa enfrentar tudo sozinho") porque já estão alinhadas à persona.

## Imagens a gerar

1. `src/assets/v2/hero-mulher-sofa.jpg` (1280×1280, premium) — mulher brasileira ~30a, suéter bege, segurando celular no sofá, luz quente âmbar de abajur ao fundo, ambiente cozy noite, mood acolhedor, sem texto.
2. `src/assets/v2/testimonial-juliana.jpg`, `-carlos.jpg`, `-ana.jpg` — só se as fotos atuais não combinarem; provavelmente reaproveita as do V1.

## Detalhes técnicos

- Manter rota `/v2` apontando para `IndexV2.tsx`.
- Reescrever `src/styles/v2-theme.css` com nova paleta clara (mantém escopo `.theme-v2` para não vazar).
- Adicionar Google Fonts (Fraunces + Inter) via `<link>` no `<head>` do `IndexV2` (Helmet) — não tocar em `index.html` global.
- Arquivos afetados (todos em `src/components/v2/`):
  - Reescrever: `HeaderV2`, `HeroV2`, `PricingV2`, `FinalCTAV2`, `StickyMobileCTAV2`, `TestimonialsV2`, `FAQV2`, `ComparisonV2`, `DemoV2`, `TransformationsV2`, `FooterV2`.
  - Criar: `HowItWorksV2`, `ChatPreviewV2`, `BenefitsGridV2`.
  - Remover do `IndexV2`: `EmotionalMirror`, `TransformationsV2`, `ComparisonV2` (substituídos por BenefitsGridV2).
- Remover animações `v2-breathe` / glows fortes do tema (não combinam com claro). Manter `v2-fade-up` sutil.
- Variant de botão `sage` continua válido — só ajusta cor sage no token.
- Preservar tracking GA4/Meta Pixel (`trackCtaClick`, `trackViewItem`) em todos os CTAs.
- `meta robots noindex` no `IndexV2` permanece (página de teste).

## Fora do escopo

- V1 (`/`) intacto.
- Checkout, portal, admin: zero mudança.
- Sem mexer em backend, edge functions ou banco.

## Validação final

Build automático + screenshot do `/v2` em desktop e mobile pra confirmar fidelidade às refs.
