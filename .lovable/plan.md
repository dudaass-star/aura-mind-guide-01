

# Plan: Página de Leitura de Episódios (Teaser + Link)

## Conceito

Uma **única página dinâmica** (`/episodio/:id`) que carrega o conteúdo do episódio pelo ID. Não é uma página por episódio — é uma rota parametrizada que busca o `essay_content` da tabela `journey_episodes`.

O fluxo fica assim:

```text
Fora da janela 24h:
  Template WhatsApp (teaser ~200 chars + link curto)
  → Usuário clica no link
  → Página /episodio/:id com conteúdo completo

Dentro da janela 24h:
  Texto livre completo (como funciona hoje)
```

## Mudanças

### 1. Nova página `src/pages/Episode.tsx`

- Rota: `/episodio/:id`
- Busca `journey_episodes` pelo ID (tabela já tem RLS pública para SELECT)
- Renderiza: título da jornada, número do episódio, stage_title, essay_content formatado
- Design alinhado com a identidade visual da Aura (roxo, minimalista)
- Sem necessidade de autenticação (link público, conteúdo não é sensível)

### 2. Rota no `App.tsx`

- Adicionar `<Route path="/episodio/:id" element={<Episode />} />`

### 3. Atualizar `generate-episode-manifesto/index.ts`

- Quando fora da janela de 24h, gerar **duas versões**:
  - `teaser`: mensagem curta (~150 chars) com gancho do episódio + link
  - `fullMessage`: mensagem completa (como hoje, para uso dentro da janela)
- O teaser usa `create-short-link` para gerar link curto apontando para `/episodio/:id`

### 4. Atualizar `whatsapp-official.ts` → `sendProactiveMessage`

- Quando fora da janela e a mensagem é de conteúdo/jornada: usar o teaser em vez do texto completo
- O teaser cabe em um único template (< 900 chars), eliminando o problema do split

### 5. Domínio no allowlist de `create-short-link` e `redirect-link`

- Adicionar `aura-mind-guide-01.lovable.app` (já está na lista, confirmado)

### Exemplo de teaser no WhatsApp

```
Conteúdo da Aura 🌿

Oi Maria. 💜

📍 EP 3/8 — O Peso do Perfeccionismo
Jornada: Ansiedade

Seu episódio está pronto. Toque para ler:
👉 https://link.curto/abc123

— Aura
```

## Arquivos

1. `src/pages/Episode.tsx` — nova página dinâmica
2. `src/App.tsx` — adicionar rota
3. `supabase/functions/generate-episode-manifesto/index.ts` — gerar teaser + link
4. `supabase/functions/_shared/whatsapp-official.ts` — usar teaser quando fora da janela

## Benefícios

- **Uma única página** para todos os episódios de todas as jornadas
- Template curto que cabe facilmente no limite de 1024 chars
- Sem split de mensagem, sem partes extras
- Conteúdo completo disponível na web com visual bonito
- Link curto com expiração de 24h (já implementado)

