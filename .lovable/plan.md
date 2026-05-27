## Problema

O login Google do portal foi trocado para `supabasePortal.auth.signInWithOAuth("google")` direto. Mas o Google neste projeto é OAuth gerenciado pela Lovable (broker), sem client secret configurado no Supabase — por isso o `/auth/v1/authorize?provider=google` responde `validation_failed: Unsupported provider: missing OAuth secret`.

A função que funciona é `lovable.auth.signInWithOAuth("google", ...)`. Mas ela grava a sessão no **cliente Supabase padrão** (`storageKey` default), o mesmo do admin — anulando o isolamento que acabamos de construir.

## Solução

Voltar a usar `lovable.auth.signInWithOAuth("google", ...)` no botão e, ao voltar do callback em `/meu-espaco`, **migrar a sessão** do cliente padrão para o `supabasePortal` e limpar a sessão do cliente padrão (local apenas, sem chamar o endpoint de logout que invalida o refresh token).

Fluxo:
1. Usuário clica em "Continuar com Google" no `/meu-espaco/entrar`.
2. Lovable broker faz o OAuth e devolve tokens; o callback grava no `supabase` padrão e redireciona para `/meu-espaco`.
3. Em `/meu-espaco`, um efeito detecta: "o cliente padrão tem sessão e o cliente do portal não tem". Nesse caso:
   - Lê `{ access_token, refresh_token }` do padrão.
   - Chama `supabasePortal.auth.setSession({ access_token, refresh_token })` → grava em `aura-portal-auth`.
   - Chama `supabase.auth.signOut({ scope: "local" })` → remove só do `localStorage` padrão, sem invalidar o token no servidor (continua válido no portal).
4. Daí pra frente o `PortalAuthContext` (já listenando `supabasePortal`) assume e segue o fluxo normal de link por email/telefone.

Isso preserva o isolamento: admin não é deslogado, e a sessão Google do usuário fica só no storage do portal.

### Mudanças

1. **`src/pages/PortalLogin.tsx`**
   - Reverter `handleGoogle` para `lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/meu-espaco" })` (mantendo o tratamento de erro/redirected atual).
   - Reimportar `lovable` de `@/integrations/lovable`.
   - As chamadas de OTP por email continuam no `supabasePortal` (já funcionam corretamente, sem broker).

2. **Novo helper** `src/contexts/portalSessionBridge.ts` (ou inline em um `useEffect` no `PortalAuthContext`)
   - Função `migrateDefaultSessionToPortal()`:
     - `const { data } = await supabase.auth.getSession()`
     - se houver sessão E `supabasePortal.auth.getSession()` estiver vazio:
       - `await supabasePortal.auth.setSession({ access_token, refresh_token })`
       - `await supabase.auth.signOut({ scope: "local" })`
   - Importa `supabase` (default) e `supabasePortal`.

3. **`src/contexts/PortalAuthContext.tsx`**
   - No `useEffect` de boot, antes de `supabasePortal.auth.getSession()`, chamar `await migrateDefaultSessionToPortal()`.
   - Isso cobre o caso de o usuário aterrissar em `/meu-espaco` direto do callback Google.

### Fora de escopo

- Não mexer no `lovable.auth` ou tentar configurar Google OAuth próprio no Supabase.
- Não alterar `/admin` nem o cliente padrão.
- Sem mudanças em edge functions/RLS.

### Validação

- Botão Google em `/meu-espaco/entrar` → vai pro Google → volta pra `/meu-espaco` → portal abre logado, admin (se estava aberto em outra aba) **continua logado**.
- OTP por email no portal → continua funcionando isolado.
- "Sair" no portal → só desloga portal; admin intacto.
