## Plano: Alinhar FooterV2 com Footer V1

### Contexto
O rodapé da V2 (`FooterV2`) tem um layout em grid de 4 colunas com seções "AURA", "Suporte" e "Siga a AURA". O rodapé da V1 (`Footer`) é centralizado e inclui trust badges e email de suporte mais proeminente. O objetivo é trazer os elementos/informações do V1 para o layout escuro da V2.

### Alterações no FooterV2 (`src/components/v2/FooterV2.tsx`)

1. **Adicionar trust badges**
   - Inserir os badges "Conforme LGPD" e "Dados criptografados" com ícones (`Shield`, `Lock`) antes do bloco de copyright.
   - Adaptar cores para o tema escuro da V2: fundo sutil, texto branco, ícones em tom claro.

2. **Tornar email de suporte mais visível**
   - Adicionar o link `suporte@olaaura.com.br` como elemento separado e destacado, igual ao V1.

3. **Manter estrutura de links do V1 dentro do layout V2**
   - Garantir que os links principais do V1 (Blog, Termos, Privacidade, Cancelar) estejam presentes.
   - Blog atualmente só aparece no header do V2, não no footer — adicionar no footer.

4. **Preservar visual escuro da V2**
   - Manter `v2-dark-section`, bordas `border-white/10`, textos em tons de branco (`text-white/75`, `text-white/55`).
   - Logo continua com `brightness-0 invert`.

### Resultado esperado
Rodapé da V2 mantém o layout escuro, mas passa a ter as mesmas informações e elementos de confiança do rodapé da V1 (trust badges, email visível, links equivalentes).