## Plano

1. **Marcar o login como fluxo do portal antes de abrir o Google**
   - Ao clicar em “Continuar com Google” em `/meu-espaco/entrar`, gravar uma flag curta no `sessionStorage`, por exemplo `aura-oauth-target=portal`.
   - Isso permite identificar que a sessão recém-criada pelo broker do Google deve ser tratada como portal, não como admin.

2. **Impedir o hook do admin de aceitar sessão do Google quando o alvo for portal**
   - Ajustar `useAdminAuth` para, ao detectar essa flag, limpar apenas a sessão local do cliente padrão e manter `isAdmin=false`.
   - Assim o admin não “pisca” logado nem assume o usuário do portal enquanto a migração acontece.

3. **Finalizar a migração no portal e limpar a flag**
   - Manter a ponte que copia a sessão do cliente padrão para `supabasePortal`.
   - Depois de migrar com sucesso, limpar a sessão local padrão e remover a flag `aura-oauth-target`.
   - O portal continua usando `aura-portal-auth`, e o admin continua usando o storage padrão.

4. **Proteger o botão de sair do portal**
   - Garantir que “Sair” no `/meu-espaco` chame apenas `supabasePortal.auth.signOut()`, sem invalidar o token do admin.
   - Se sobrar sessão temporária do broker no storage padrão durante fluxo portal, limpar localmente, não globalmente.

## Resultado esperado

- Clicar em Google no `/meu-espaco/entrar` entra somente no portal.
- `/admin` não aparece logado por causa desse clique.
- Sair do portal não derruba o admin.
- Login normal do `/admin` continua funcionando como antes.

## Detalhes técnicos

Arquivos previstos:
- `src/pages/PortalLogin.tsx`
- `src/contexts/portalSessionBridge.ts`
- `src/hooks/useAdminAuth.ts`

Sem mudanças em banco, RLS, edge functions ou configuração de OAuth.