

# Auditoria de Conversao da Landing Page AURA

## Analise por Secao (fluxo do lead)

### O que esta funcionando bem
- **Hero**: Video autoplay chama atencao, headline clara, CTA direto com preco
- **Problem**: Dor bem articulada, transicao "E se existisse outra forma?" eficaz
- **ForWho**: Identificacao com perfis reais, CTA intermediario presente
- **Demo**: Conversa simulada com tipagem humana, muito persuasiva
- **Pricing**: Toggle mensal/anual, badge "Mais escolhido", precos por dia
- **Comparison**: Tabela visual clara AURA vs Terapia Tradicional
- **FAQ**: Objecoes principais cobertas
- **Checkout**: Exit-intent popup, planos com trial price em destaque

### Problemas Identificados (priorizados por impacto na conversao)

#### 1. ForWho usa `<a href>` e `<button>` manuais em vez de `<Link>` + `<Button>`
O CTA "Começar por R$ 6,90" na secao ForWho usa uma tag `<a href="/checkout">` com botao inline estilizado manualmente, nao o componente `<Button variant="sage">`. Isso causa full page reload (perde estado do SPA) e quebra a consistencia visual. O mesmo problema existe no CTA de Testimonials.

#### 2. Testimonials CTA tambem usa `<a href>` + botao manual
Mesmo problema do ForWho. Ambos devem usar `<Link to="/checkout"><Button>`.

#### 3. Secao Benefits nao tem CTA
Apos mostrar 11 beneficios incriveis, o usuario fica sem acao imediata. E a secao mais rica em valor e nao tem botao nenhum. Oportunidade perdida.

#### 4. Meditations nao tem CTA
Mesma situacao: secao de meditacoes termina sem oferecer nenhuma acao ao usuario.

#### 5. FinalCTA fraco — frase "+5.000 pessoas ja comecaram" esta solta
A prova social esta como unico "trust badge" sem contexto. Falta urgencia ou reforco de objecao (ex: "Sem fidelidade", "Cancele quando quiser").

#### 6. Comparison nao tem CTA
Apos a tabela comparativa (momento de alta conviccao), nao ha botao para converter. O lead precisa scrollar mais para encontrar um CTA.

#### 7. Erro de ortografia em Meditations
"estresse" deveria ser "estress**e**" (correto) — na verdade, "estresse" esta correto em portugues. Mas "Ansiedade, sono, foco, estresse, gratidão" poderia ter mais impacto visual.

#### 8. Header mobile sem CTA sticky
No mobile, o botao "Começar agora" esta escondido no menu hamburger. O usuario precisa abrir o menu para converter. Um CTA fixo no bottom seria mais eficaz.

---

## Plano de Melhorias

### Prioridade 1 — CTAs ausentes (maior impacto)
- **Benefits**: Adicionar CTA "Começar por R$ 6,90" ao final da secao
- **Meditations**: Adicionar CTA ao final
- **Comparison**: Adicionar CTA apos a tabela comparativa
- Todos usando `<Link to="/checkout"><Button variant="sage" size="xl">`

### Prioridade 2 — Corrigir links quebrados (SPA)
- **ForWho**: Substituir `<a href="/checkout"><button>` por `<Link to="/checkout"><Button variant="sage">`
- **Testimonials**: Substituir `<a href="/checkout"><button>` por `<Link to="/checkout"><Button variant="sage">`

### Prioridade 3 — FinalCTA mais forte
- Adicionar trust badges: "Sem fidelidade", "Cancele quando quiser", "Dados protegidos"
- Manter "+5.000 pessoas" mas como badge inline, nao isolado

### Prioridade 4 — Mobile sticky CTA
- Adicionar barra fixa no bottom do mobile com "Começar por R$ 6,90" que aparece apos o Hero sair da viewport (usando IntersectionObserver)

---

## Detalhes tecnicos
- 6 arquivos modificados: `ForWho.tsx`, `Testimonials.tsx`, `Benefits.tsx`, `Meditations.tsx`, `Comparison.tsx`, `FinalCTA.tsx`
- 1 arquivo novo: `src/components/StickyMobileCTA.tsx` (barra fixa bottom mobile)
- `Index.tsx` atualizado para incluir o sticky CTA
- Sem mudancas no banco de dados
- Todas as dependencias ja existem (Link, Button, Lucide icons)

