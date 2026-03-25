

# Trocar fonte display para Fraunces

## O que muda
Substituir **Libre Baskerville** por **Fraunces** — uma serif orgânica, suave e acolhedora — em todos os títulos e destaques do site.

## Arquivos alterados

### 1. `src/index.css`
- Trocar o import do Google Fonts de `Libre+Baskerville` para `Fraunces` (com pesos 400, 500, 600, 700, 900 e itálico)
- Atualizar `--font-display` para `'Fraunces', serif`

### 2. `tailwind.config.ts`
- Atualizar `fontFamily.display` de `['Libre Baskerville', 'serif']` para `['Fraunces', 'serif']`

### 3. `index.html`
- Nenhuma mudança necessária (fontes carregam via CSS)

## Resultado esperado
Todos os `h1`–`h6` e elementos com `font-display` passarão a usar Fraunces, dando um visual mais quente, arredondado e acolhedor — alinhado com o tom emocional da Aura.

