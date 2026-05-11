## Ajustar links e CTA do header V2 (mantendo visual)

Trocar a navegação e o botão do `HeaderV2` para os mesmos do `Header` V1, sem mexer no visual escuro/sage do V2.

### Mudanças em `src/components/v2/HeaderV2.tsx`

**Links de navegação (desktop e mobile)** — substituir:
- `Como funciona`, `Recursos`, `Depoimentos`, `Planos`, `Perguntas`
  
Por:
- `Guia` → `<Link to="/guia">`
- `Blog` → `<Link to="/blog">`
- `Preços` → `<a href="#precos">`
- `FAQ` → `<a href="#faq">`

**Botão CTA** — substituir:
- `Começar por R$ 6,90` → `Começar agora`
- Eventos GA4: `"Começar agora (v2 desktop)"` e `"Começar agora (v2 mobile menu)"`
- Mantém `variant="sage"` e `rounded-full` (estilo V2)

### O que NÃO muda

- Fundo escuro com transição on-scroll (`bg-[hsl(220_35%_10%/0.85)] backdrop-blur-md`)
- Logo com `brightness-0 invert` (branco)
- Tipografia, espaçamentos e classe `linkBase` clara
- Menu mobile com fundo navy
- Destino do CTA (`/checkout`)

Resultado: header do V2 com visual idêntico ao atual, mas com os mesmos itens de menu e texto de botão do V1.
