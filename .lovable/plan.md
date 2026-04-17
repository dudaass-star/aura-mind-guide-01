

## Diagnóstico

O link do episódio enviado pelo WhatsApp é:
```
https://olaaura.com.br/episodio/{id}?u={userId}
```

No `Episode.tsx` o botão de voltar (`Meu Espaço`) só funciona corretamente se houver `?t=<portalToken>` na URL — caso contrário cai em `window.history.back()`, que não leva a nada quando o usuário acabou de abrir o link direto do WhatsApp. Hoje o link nunca traz `t`, então o usuário fica preso na tela do episódio.

Mesmo problema acontece no portal: ao clicar em um episódio dentro de `JornadasTab`, abrimos `?u=<userId>` em nova aba e perdemos o token do portal.

## Plano de correção

### 1. Sempre incluir o `portalToken` no link do episódio enviado pelo WhatsApp
Em `supabase/functions/generate-episode-manifesto/index.ts`:
- Buscar (ou criar via upsert) o `user_portal_tokens.token` do usuário, igual já fazem `weekly-report`, `start-trial`, `stripe-webhook` e `deliver-time-capsule`.
- Montar o link como:
  ```
  https://olaaura.com.br/episodio/{episodeId}?u={userId}&t={portalToken}
  ```
- Manter `u` por compatibilidade (final de jornada / escolha da próxima jornada continua usando `u`).

### 2. Preservar o token do portal ao abrir um episódio a partir do `JornadasTab`
Em `src/components/portal/JornadasTab.tsx`:
- Receber o `portalToken` por prop (vindo de `UserPortal.tsx`, que já tem o `token` da URL).
- Ao clicar num episódio, abrir `/episodio/{id}?u={userId}&t={portalToken}`.

### 3. Passar o token de `UserPortal` para `JornadasTab`
Em `src/pages/UserPortal.tsx`:
- Repassar o `token` que já está em `searchParams` como prop `portalToken` ao `<JornadasTab />`.

### 4. (Opcional, mas recomendado) Tornar o botão "Meu Espaço" sempre visível quando houver `userId`
Em `src/pages/Episode.tsx`:
- Quando só temos `u` (sem `t`), buscar o token do portal pelo `userId` (a tabela `user_portal_tokens` já tem RLS público de leitura por chave) e usá-lo no botão de voltar.
- Isso protege links antigos que ainda estão no histórico do WhatsApp dos usuários.

### Arquivos afetados
- `supabase/functions/generate-episode-manifesto/index.ts` — incluir `&t=<portalToken>` no link
- `src/components/portal/JornadasTab.tsx` — receber e propagar `portalToken`
- `src/pages/UserPortal.tsx` — passar `portalToken` para `JornadasTab`
- `src/pages/Episode.tsx` — fallback que busca o token via `userId` quando só vier `u`

### Sem mudanças de banco
A tabela `user_portal_tokens` já existe com token único por usuário e RLS adequado.

### Resultado esperado
- Todo link de episódio enviado pelo WhatsApp passará a abrir já com o contexto do portal. O botão "Meu Espaço" no topo levará o usuário direto ao painel `/meu-espaco?t=...&tab=jornadas`.
- Dentro do portal, abrir um episódio mantém o contexto e permite voltar com um clique.
- Links antigos sem `t` continuam funcionando porque o `Episode.tsx` recupera o token a partir do `userId`.

