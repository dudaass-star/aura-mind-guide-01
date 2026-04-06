

## Plano: Ajustar popup de exit-intent (Checkout + Preview)

### Alterações

**1. Botão "Quero experimentar"** — atualmente apenas fecha o popup. Será alterado para fazer scroll até o formulário de pagamento (já está na mesma página), fechando o popup simultaneamente.

**2. Remover links desnecessários** — remover o link "Fale conosco" (WhatsApp) e o botão "Não, obrigado" de ambos os arquivos. O popup fechará apenas ao clicar no CTA ou ao clicar fora dele (backdrop click).

**3. Substituir emoji 🎁 por ícone Lucide** — usar o ícone `Gift` do lucide-react no lugar do emoji.

**4. Atualizar social proof** — trocar "+500 pessoas já começaram" por "+5.000 pessoas já começaram".

### Arquivos modificados

- `src/pages/Checkout.tsx` — popup real (linhas ~526-570)
- `src/pages/AdminPopupPreview.tsx` — preview admin (espelhar as mesmas mudanças visuais)

### Detalhes técnicos

- Import `Gift` de `lucide-react` em ambos os arquivos
- No Checkout, o `onClick` do botão CTA fará `setShowExitPopup(false)` + scroll para o form (via `document.getElementById` ou `scrollIntoView`)
- Backdrop click (`onClick` no overlay `div`) fechará o popup
- Remover `MessageCircle` import do AdminPopupPreview se não for mais usado

