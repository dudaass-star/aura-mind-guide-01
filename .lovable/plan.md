Objetivo: Remover o Sticky CTA duplicado da página de checkout (/v2/checkout), pois a página é curta e o botão principal já está visível no formulário.

Problema
--------
A página CheckoutV2 renderiza um sticky CTA fixo na parte inferior do mobile (linhas 658-673 do `src/pages/CheckoutV2.tsx`). Ele duplica o botão "Começar por R$ X" que já existe no próprio formulário (linha 616). Como a página de checkout é curta (formulário compacto com plano, dados pessoais e CTA), o usuário sempre vê o botão principal sem precisar rolar. O sticky CTA só polui a tela e cria redundância visual.

Alteração
---------
1. Remover o bloco de sticky CTA mobile (linhas 658-673) do `CheckoutV2.tsx`.
2. Ajustar o padding-bottom do container principal (`pb-32` → `pb-12` ou similar) para remover o espaço reservado ao sticky que não existe mais.

Validação
---------
- Visualizar a página /v2/checkout em viewport mobile e confirmar que não há CTA fixo na parte inferior.
- Confirmar que o botão "Começar por R$ X" dentro do formulário continua visível e funcional.
- Verificar que não há overflow ou cortes no conteúdo após remover o padding de compensação.