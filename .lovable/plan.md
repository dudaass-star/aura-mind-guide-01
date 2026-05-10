## Diagnóstico

Os arquivos `public/favicon.ico` e `public/favicon.png` (com o ícone da AURA) já existem, mas o `index.html` **não declara nenhuma tag `<link rel="icon">`**. Sem isso, o Google indexou o favicon padrão do domínio de preview do Lovable (que era o que servia `/favicon.ico` antes do arquivo próprio existir) e segue exibindo essa versão cacheada nos resultados de busca.

## Solução

1. **Adicionar as tags de ícone no `<head>` do `index.html`**, logo após as meta tags básicas:

   ```html
   <link rel="icon" type="image/x-icon" href="/favicon.ico" />
   <link rel="icon" type="image/png" href="/favicon.png" />
   <link rel="apple-touch-icon" href="/aura-app-icon.png" />
   ```

   Isso garante que navegadores e crawlers (Google, redes sociais) usem o ícone da AURA já presente em `public/`.

2. **Publicar** o site para que as novas tags fiquem no HTML servido em `olaaura.com.br`.

3. **Forçar reindexação no Google Search Console** (passo manual, fora do código): após o deploy, abrir o Search Console → "Inspecionar URL" → colar `https://olaaura.com.br` → "Solicitar indexação". Mesmo com tudo correto no ar, o Google leva de alguns dias até semanas para atualizar o favicon nos resultados — é o ritmo dele, não tem como acelerar mais que isso.

## Detalhes técnicos

- Mudança isolada no `index.html`. Nenhum componente React, asset ou configuração de build é tocado.
- Os três tamanhos cobrem: navegadores modernos (`favicon.png`), legado/Windows (`favicon.ico`), iOS/share previews (`aura-app-icon.png`).
- Não estou gerando arquivos novos — só referenciando os que já existem em `public/`.
