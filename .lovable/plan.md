

# Plano: Criar Favicon Personalizado para AURA

## Conceito

Gerar um favicon que represente a identidade da AURA — acompanhamento emocional, conexão, presença. O favicon precisa funcionar em 16x16, 32x32 e 192x192 (PWA).

## Direção Visual

Opções que combinam com a marca AURA (tons sage/lavender, sensação de calma e profundidade):

- **Letra "A" estilizada** com gradiente sage → lavender, arredondada e moderna
- **Círculo com brilho interno** (aura luminosa), remetendo à ideia de energia/presença
- **Onda suave** dentro de um círculo, representando fluxo emocional

## Implementação

1. **Gerar o ícone** usando o modelo de geração de imagem (Gemini image) via edge function
2. **Salvar no storage** do projeto como PNG 512x512
3. **Atualizar `index.html`** com os links corretos para favicon (16, 32, 180 apple-touch, 192 manifest)
4. **Substituir `public/favicon.png`** atual

## Arquivos afetados
- `public/favicon.png` (substituído)
- `index.html` (atualizar meta tags de ícone se necessário)

