# Plano — SEO próprio sob olaaura.com.br

## 1. Sitemap estático no domínio próprio

**Por quê**: hoje o `sitemap.xml` é servido pela edge function no domínio `*.supabase.co`. Funciona, mas é subóptimo. Mover pra `https://olaaura.com.br/sitemap.xml` aumenta confiança dos crawlers e elimina ambiguidade de host.

**Como**:
- Criar `scripts/generate-sitemap.ts` que:
  - Conecta no Supabase (usa `VITE_SUPABASE_URL` + anon key, leitura pública de `blog_posts` com `status='published'` + `blog_clusters`)
  - Monta entries: `/`, `/v2`, `/blog`, `/blog/:slug` (todos posts publicados), `/blog?cluster=<slug>` (5 clusters)
  - Escreve `public/sitemap.xml` com `BASE_URL=https://olaaura.com.br`
- Adicionar no `package.json`: `"predev"` e `"prebuild"` rodando `bunx tsx scripts/generate-sitemap.ts`
- Atualizar `public/robots.txt` → `Sitemap: https://olaaura.com.br/sitemap.xml`
- Manter edge function `blog-sitemap` como fallback (sem custo, útil pra debug)

**Trade-off conhecido**: sitemap só atualiza no próximo deploy. Mitigado pelo passo 2.

## 2. Notificação imediata aos buscadores (IndexNow + Google ping)

**Por quê**: posts são publicados via cron 2x/semana. Sem isso, Google pode levar dias pra descobrir.

**Como**: dentro de `supabase/functions/generate-blog-post/index.ts`, após inserir post com `status='published'`, disparar (fire-and-forget):
- `GET https://www.google.com/ping?sitemap=https://olaaura.com.br/sitemap.xml`
- `POST https://api.indexnow.org/indexnow` com a URL do post novo (cobre Bing/Yandex/Seznam)
- Requer hospedar arquivo `public/<key>.txt` com a chave IndexNow (gerada uma vez)

## 3. Disparar primeira geração agora

Invocar `generate-blog-post` manualmente pra processar a entrada queued mais antiga ("Como acalmar a mente" — pilar Ansiedade). Validar:
- Conteúdo gerado (1500+ palavras, H2s, CTAs)
- Cover IA salva no bucket
- Meta title/description dentro dos limites
- Post visível em `/blog` e `/blog/como-acalmar-a-mente`

## 4. Google Search Console — verificar e submeter sitemap

- Checar se `olaaura.com.br` já está verificada (`GET /webmasters/v3/sites`)
- Se não: pedir token META, injetar tag em `index.html`, chamar verify
- Adicionar site ao Search Console (`PUT /sites/<encoded>`)
- Submeter o novo sitemap (`PUT /sites/.../sitemaps/<encoded>`)

## 5. Atualizar memória

Salvar em `mem://features/blog/sitemap-strategy` o novo padrão (sitemap estático + IndexNow + ping) pra futuras manutenções não regredirem.

---

## Detalhes técnicos

**Arquivos a criar/editar**:
- `scripts/generate-sitemap.ts` (novo)
- `package.json` (predev/prebuild)
- `public/robots.txt` (Sitemap line)
- `public/<indexnow-key>.txt` (novo, gerado)
- `supabase/functions/generate-blog-post/index.ts` (adicionar ping pós-publish)
- `index.html` (meta de verificação Search Console, se necessário)

**Sem mudanças**:
- Schema do banco
- Edge function `blog-sitemap` (mantida como fallback)
- Cron `generate-blog-post-tue-fri`
- Rotas `/blog` e `/blog/:slug`

**Ordem de execução**: 1 → 2 → 3 (validação) → 4 → 5
