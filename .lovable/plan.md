## Tarefa

Adicionar a metatag de verificação de domínio do Meta (Facebook) na seção `<head>` do `index.html`.

## Contexto

O usuário recebeu uma instrução do Meta Business para verificar o domínio `olaaura.com.br`. A verificação exige que a seguinte metatag seja inserida na `<head>` da página inicial:

```html
<meta name="facebook-domain-verification" content="25k5ceql01zzi2zmx7auh4rv3v6961" />
```

## Implementação

1. **Arquivo:** `index.html`
2. **Ação:** Inserir a metatag acima dentro da seção `<head>...</head>`, preferencialmente junto às outras metatags (`<meta name="description" ...>`).
3. **Validação:** A tag deve estar estática no HTML inicial (não injetada via JavaScript), pois o crawler do Meta não executa JS para essa verificação.

## Notas Técnicas

- O projeto já possui outras metatags no `<head>` de `index.html` (description, author, viewport, OG tags, etc.).
- Nenhuma outra alteração é necessária — esta é uma adição pura e simples.
- Após a alteração, o usuário precisará publicar o site para que o crawler do Meta veja a tag no código-fonte.