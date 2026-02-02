
# Plano: Atualizar Favicon do Site AURA

## Resumo
Substituir o favicon atual (que está mostrando o ícone da Lovable) pela imagem do símbolo AURA que você acabou de enviar.

## O que será feito

1. **Copiar a imagem para o projeto**
   - Copiar o arquivo `user-uploads://Simbolo_Aura.png` para `public/favicon.png`

2. **Atualizar o `index.html`**
   - Alterar a referência do favicon da URL externa para o arquivo local
   - Linha 28: de URL do Google Storage para `/favicon.png`

3. **Remover arquivo antigo (se necessário)**
   - O arquivo `public/favicon.ico` existente pode estar sendo usado como fallback pelos navegadores

## Mudanças no código

**Arquivo: `index.html` (linha 28)**

De:
```html
<link rel="icon" type="image/png" href="https://storage.googleapis.com/gpt-engineer-file-uploads/...">
```

Para:
```html
<link rel="icon" type="image/png" href="/favicon.png">
```

## Resultado esperado
Após a alteração, a aba do navegador exibirá o símbolo AURA (círculo com gradiente verde/roxo) em vez do ícone da Lovable.

## Nota
Pode ser necessário limpar o cache do navegador (Ctrl+Shift+R ou Cmd+Shift+R) para ver o novo favicon imediatamente.
