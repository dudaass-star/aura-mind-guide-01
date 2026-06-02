## Objetivo
Reverter o caminho de `?t=<token>` que adicionei por engano e manter só os fixes que melhoram o login normal (Google + email código/link).

## Mudanças

### Reverter
1. **Apagar** `supabase/functions/resolve-portal-token/` (código + entry no `supabase/config.toml`) e deletar a função do deploy.
2. **`src/pages/UserPortal.tsx`** — remover toda a lógica de detectar `?t=`, chamar `resolve-portal-token` e redirecionar. Volta ao comportamento original: se não há sessão → `<Navigate to="/meu-espaco/entrar" />`.
3. **`src/pages/PortalLogin.tsx`** — remover `?email=` prefill e `autoSend=1`. Sem fluxo legado, só o login direto (Google + email manual).

### Manter (fixes do login normal)
- **`PortalLogin.tsx`** — copy do passo OTP: deixa explícito que chegou **código + link** e dica de spam.
- **`PhoneLinkPrompt.tsx`** — placeholder `(DDD) 90000-0000`, mensagens de erro mais claras, link de suporte WhatsApp ao falhar.

### Não mexer
- Token do Marcelo no DB (inofensivo, fica como histórico).
- Geradores de `?t=` existentes (AdminUsers, weekly-report, etc.) — links antigos passam a cair na tela de login normal.

## Pendente (manual, no Dashboard)
- **Authentication → Email Templates → Magic Link**: incluir `{{ .Token }}` (código de 6 dígitos) junto com `{{ .ConfirmationURL }}` (link).
