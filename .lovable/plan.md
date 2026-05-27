## Problema

O `src/integrations/supabase/client.ts` é um único cliente Supabase compartilhado entre `/admin` e `/meu-espaco` — ambos leem/escrevem a sessão na mesma chave do `localStorage`. Por isso:

- Logar com Google em `/meu-espaco` reaproveita a sessão do admin (mesmo `auth.uid`) e cai na tela "Você está logado como admin".
- O "Sair" do portal chama `supabase.auth.signOut()` no cliente compartilhado → desloga o admin junto.

## Solução

Criar um **segundo cliente Supabase exclusivo do portal**, com `storageKey` próprio, e usá-lo apenas no fluxo do portal (`PortalAuthContext`, `PortalLogin`, `link-portal-account` invoke). O admin e o resto do app continuam usando o cliente padrão intocado.

Assim:
- Sessão do admin e sessão do portal ficam totalmente independentes no mesmo navegador.
- Login Google em `/meu-espaco` cria/usa uma sessão separada — não "herda" o admin.
- Logout no portal só afeta o portal.

### Mudanças

1. **Novo arquivo** `src/integrations/supabase/portal-client.ts`
   - `createClient` com mesma URL/anon key, mas:
     - `auth.storageKey: "aura-portal-auth"`
     - `auth.storage: localStorage`, `persistSession: true`, `autoRefreshToken: true`
   - Exporta `supabasePortal`.
   - Não tocar em `client.ts` (gerado automaticamente).

2. **`src/contexts/PortalAuthContext.tsx`**
   - Trocar import `supabase` → `supabasePortal`.
   - `onAuthStateChange`, `getSession`, `signOut`, e `functions.invoke("link-portal-account", ...)` passam pelo `supabasePortal` (a invoke usa o JWT do portal, que é o que queremos pra vincular o profile à conta certa).

3. **`src/pages/PortalLogin.tsx`**
   - Trocar `supabase` → `supabasePortal` em `signInWithOtp`, `verifyOtp`.
   - O botão Google hoje usa `lovable.auth.signInWithOAuth`; trocar por `supabasePortal.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin + "/meu-espaco" } })` para que o callback OAuth grave a sessão no storage do portal, não no do admin.

4. **`src/pages/UserPortal.tsx`**
   - As queries de `profiles` / `monthly_reports` / `user_roles` continuam usando o `supabase` padrão (são SELECTs com RLS que aceitam o JWT do portal só se passado explicitamente). Para garantir que rodem com o JWT da sessão do portal, trocar essas chamadas para `supabasePortal` também. Mantém RLS correta (auth.uid() = sessão do portal).
   - Remover o ramo "Você está logado como admin": com sessões separadas ele deixa de ser necessário. Se mesmo assim o usuário entrar com uma conta admin no portal e não tiver profile vinculado, ele simplesmente cai no `PhoneLinkPrompt` como qualquer outro.

5. **`customer-portal` invoke em `UserPortal.tsx`**
   - Também passar pelo `supabasePortal` (usa o JWT certo do dono da assinatura).

### Fora de escopo

- Nenhuma mudança em edge functions, RLS, Stripe ou no cliente compartilhado.
- Sem alteração no fluxo de admin (`useAdminAuth`, `/admin/*`).
- Sem mexer em `client.ts` nem em `types.ts`.

### Validação

- Logado como admin em `/admin/usuarios`, abrir `/meu-espaco/entrar` em outra aba → pede login (não reaproveita sessão admin).
- Entrar com Google do Eduardo no portal → vincula por email/telefone e mostra jornadas; admin segue logado em `/admin`.
- Clicar em "Sair" no portal → só sai do portal; `/admin/usuarios` continua acessível sem novo login.
- Logout em `/admin/login` não derruba a sessão do portal.
