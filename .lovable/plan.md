## Plano — Fix do layout "embolado" do post do blog

### Diagnóstico

DNS do `olaaura.com.br` **já está correto** apontando pro Lovable (validei agora via DNS-over-HTTPS). O domínio serve nosso código — `/blog/como-acalmar-a-mente` retorna 200 da nossa deployment.

O problema do post "embolado" é só um: o plugin `@tailwindcss/typography` está instalado no `package.json` mas **não está registrado** em `tailwind.config.ts`. Isso faz com que as classes `prose prose-neutral dark:prose-invert prose-headings:* prose-p:* prose-a:* prose-strong:* prose-li:*` aplicadas em `src/pages/BlogPost.tsx` (linha do `<ReactMarkdown>`) sejam **no-op** — markdown renderiza sem espaçamento entre parágrafos, sem hierarquia de H2/H3, sem estilo de listas, sem links destacados.

### Mudança

**1 arquivo, 1 linha** — `tailwind.config.ts`:

```ts
plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
```

### Validação

Depois do fix, abro `https://olaaura.com.br/blog/como-acalmar-a-mente` (ou o preview) e confirmo visualmente:
- Parágrafos com espaço entre si
- H2/H3 com hierarquia clara
- Listas com bullet/numeração
- Links em cor primária
- Citações com borda lateral

### Fora de escopo

- Sem mudança em DNS (já está OK)
- Sem mudança no `BlogPost.tsx` (as classes já estão corretas, só faltava o plugin ativar)
- Sem mudança em conteúdo ou banco
