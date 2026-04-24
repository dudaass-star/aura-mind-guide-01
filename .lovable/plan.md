## Objetivo

Criar uma página `/blog` em `olaaura.com.br` que hospeda o widget do Soro, permitindo que os artigos gerados pela IA do Soro sejam exibidos sob o domínio da AURA e indexados pelo Google.

## O que será feito

### 1. Nova página `src/pages/Blog.tsx`
- Layout com `Header` (existente) no topo e `Footer` (existente) no rodapé, mantendo a identidade visual da AURA
- Container central com título "Blog AURA" e subtítulo curto sobre autoconhecimento, ansiedade, meditação, etc.
- Div alvo do Soro: `<div id="soro-blog"></div>`
- Carregamento do script do Soro via `useEffect` (necessário em SPA React, pois o `<script defer>` no JSX não executa em navegações client-side)
- Cleanup do script ao desmontar (evita duplicação ao navegar)
- SEO: `<title>Blog AURA — Autoconhecimento, Ansiedade e Meditação</title>`, `<meta name="description">`, Open Graph tags (via manipulação de `document.head` no `useEffect`, padrão usado nas outras páginas do projeto)

### 2. Registrar rota em `src/App.tsx`
Adicionar `<Route path="/blog" element={<Blog />} />` junto com as demais rotas públicas.

### 3. Link de navegação
- Adicionar item "Blog" no menu do `Header.tsx` (desktop e mobile)
- Adicionar link "Blog" na coluna de navegação do `Footer.tsx`

### 4. SEO técnico
- Confirmar `public/robots.txt` permite `/blog` (atualmente permite tudo — ok)
- Sitemap fica para um momento futuro (o Soro normalmente gera o seu próprio sitemap de artigos)

### 5. Snippet do Soro
Usar exatamente o código que aparece no painel do Soro:
```html
<div id="soro-blog"></div>
<script src="https://app.trysoro.com/api/embed/93f944b3-dd6b-4e3c-8c42-0c078e169773" defer></script>
```

## Fora do escopo (próximos passos depois)

- Decidir se `/blog` deve disparar Pixel Meta (recomendado, mas requer alteração no `GA4RouteTracker` e no setup do Pixel — fazemos numa segunda etapa, depois de confirmar que o Soro está funcionando)
- Sitemap.xml manual (Soro normalmente cuida disso)
- Estilização avançada do widget (depende do que o Soro permite via "Light/Dark" no painel deles)

## Detalhes técnicos

- **Por que `useEffect` para o script**: em SPAs React, scripts adicionados via JSX dentro de componentes não são executados pelo navegador. A forma correta é criar o elemento `<script>` programaticamente em `useEffect`, anexar ao `document.body` e remover no cleanup.
- **Estilo visual**: a página `/blog` herda Header/Footer da AURA, então a moldura segue a identidade. O conteúdo dos artigos é renderizado pelo Soro — a estilização interna depende do tema escolhido no painel do Soro (Light/Dark conforme a captura).
- **Publicação**: após implementar, é necessário **republicar o site** para que `olaaura.com.br/blog` exista. Só então o botão "I've Added the Code" no Soro vai validar com sucesso.

## Passo a passo após eu implementar

1. Eu implemento as mudanças
2. Você publica o site (botão Publish no Lovable)
3. Você acessa `olaaura.com.br/blog` e confirma que o widget carrega
4. No painel do Soro, clica em "I've Added the Code" para validar a conexão
5. Pronto — o Soro começa a publicar artigos automaticamente