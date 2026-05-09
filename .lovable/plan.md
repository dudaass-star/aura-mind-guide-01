## Objetivo

Trazer pra V2 todas as 9 perguntas do FAQ da home padrão (`FAQ.tsx`), mantendo o visual minimalista da V2.

## Mudanças

**Editar apenas `src/components/v2/FAQV2.tsx`:**

1. **Substituir o array `faqs`** pelas 9 perguntas/respostas idênticas às do `FAQ.tsx` (campos renomeados de `question/answer` → `q/a` para preservar a interface atual da V2):
   - Por que é tão mais barato que terapia?
   - A AURA substitui terapia com psicólogo?
   - Como funciona o período de teste?
   - Posso pausar minha assinatura?
   - O que são as Sessões Especiais?
   - Posso enviar áudio?
   - Meus dados ficam seguros?
   - Posso cancelar quando quiser?
   - O que é a Cápsula do Tempo?

2. **Adicionar CTA final** (espelhando a home padrão) abaixo do accordion, dentro do mesmo container:
   - Texto: "Começar por R$ 6,90"
   - `variant="sage"`, `size="xl"`, `Link to="/checkout"`
   - `trackCtaClick("faq", "Começar por R$ 6,90 (v2)")`
   - Microcopy: "7 dias para experimentar • Cancele quando quiser"

3. **Manter intactos**:
   - Header da seção (eyebrow "dúvidas" + título "O que costumam perguntar.")
   - Estilo do `AccordionItem` (`border border-border/60 rounded-2xl px-6 bg-card/40`)
   - `id="faq"` (já usado pelo header da V2)
   - Tracking via `trackFaqOpen`

## Fora de escopo

- Não mexer no FAQ da home padrão.
- Não alterar tokens de design nem o restante da V2.
