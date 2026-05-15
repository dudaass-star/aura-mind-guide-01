## Objetivo
Exportar a landing page `/v2` (publicada em `https://olaaura.com.br/v2` / preview Lovable) como **um PDF único, em formato desktop, página contínua longa** (sem quebras A4), salvo em `/mnt/documents/`.

## Abordagem
Sem alterar nenhum arquivo do projeto. Tudo é feito via script local no sandbox, usando Playwright Chromium headless contra a URL pública da landing.

### Passos
1. **Renderizar a página em desktop** (`1440x900`) numa instância Chromium headless apontando para a URL de preview do projeto (`/v2`).
2. **Aguardar carregamento completo**: `networkidle` + scroll programático até o fim da página para forçar lazy-load de imagens (hero, depoimentos, etc.) e disparar animações `v2-fade-up`. Depois, voltar ao topo.
3. **Medir a altura real** do `document.body` após o scroll.
4. **Gerar PDF em página única** usando `page.pdf()` com:
   - `width: "1440px"`
   - `height: "<altura medida>px"` (página única, sem paginação A4)
   - `printBackground: true` (preserva o tema escuro `v2-dark-section` e gradientes)
   - `preferCSSPageSize: false`
5. **Esconder elementos sticky/fixos** que poluiriam o PDF (header fixo após scroll, `StickyMobileCTAV2`) injetando um `<style>` antes do print:
   - `.fixed { position: absolute !important; }` no header (ou ocultar a versão "scrolled")
   - Ocultar `StickyMobileCTAV2` (só aparece em mobile, mas garantia)
6. **Salvar** em `/mnt/documents/landing-v2.pdf`.
7. **QA visual**: converter o PDF em JPEG (`pdftoppm -r 100`) e inspecionar para garantir que:
   - Hero renderizou com a foto e a bolha de chat
   - Seções escuras mantiveram o fundo
   - Nada cortado nas bordas
   - Imagens lazy carregaram
8. Entregar via `<presentation-artifact>`.

## Detalhes técnicos
- Ferramenta: Playwright via `npx playwright` (Chromium já vem nas deps do sandbox; se não, instalar com `npx playwright install chromium`).
- URL alvo: `https://olaaura.com.br/v2` (domínio canônico, conteúdo idêntico ao preview).
- Output: `/mnt/documents/landing-v2.pdf`.
- Mime: `application/pdf`.

## Fora de escopo
- Nenhuma mudança em código React/Tailwind.
- Nenhuma versão paginada A4 ou mobile (pode ser pedida depois).
- Nenhum ajuste de SEO/meta tags.