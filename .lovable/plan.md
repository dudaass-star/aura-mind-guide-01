## Objetivo
Eliminar o scroll horizontal das abas no mobile fazendo com que as 5 abas caibam em 390px, mantendo o design Deep Navy Anchor atual.

## Comportamento

**Mobile (< 640px):**
- Cada aba mostra **só o ícone** por padrão (largura fixa ~44px, `flex-1` distribuído).
- A aba **ativa expande** e mostra ícone + label ao lado (pill navy sutil).
- Underline navy embaixo continua marcando a ativa.
- Badge de novidade (bolinha lavender) continua no canto superior do ícone.
- Zero overflow horizontal — a barra ocupa 100% da largura disponível.

**Desktop (≥ 640px):**
- Mantém exatamente como está hoje: ícone + label sempre visíveis, underline navy, sem mudanças.

## Implementação
Alterar apenas `src/pages/UserPortal.tsx`, dentro do bloco de tabs:

- Remover `overflow-x-auto` e `whitespace-nowrap` no mobile (manter em desktop via `sm:` se necessário).
- Trocar o container das tabs para `flex justify-between sm:justify-start w-full`.
- No `<button>` de cada tab:
  - Mobile: `flex-1 justify-center` com só o ícone; o `<span>` do label recebe `hidden sm:inline`.
  - Quando `isActive` no mobile: o `<span>` do label ganha `inline` (override) + padding lateral pra virar pill.
- Ajustar tamanho do ícone pra 16px no mobile ativo, manter 14px inativo pra dar destaque.
- Badge de novidade: reposicionar como `absolute top-1.5 right-1.5` no mobile pra não conflitar com o layout ícone-only.
- Underline navy: manter, mas ajustar `w-6` pra `w-8` na aba ativa mobile (fica proporcional ao pill).

## Fora de escopo
- Não mudar cor, tipografia, ordem das abas, nem lógica de novidades.
- Não mudar comportamento de nenhuma outra parte do portal.

## Validação
Rodar Playwright em 390px, capturar screenshot do topo do `/meu-espaco`, confirmar:
1. As 5 abas visíveis sem scroll horizontal.
2. Aba ativa mostra ícone + label; inativas só ícone.
3. Underline navy alinhado à ativa.
4. Badge lavender aparece corretamente nas abas com novidade.
