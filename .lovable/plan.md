## Contexto

O portal `/meu-espaco` mudou: não usa mais token UUID na URL. O login agora é via Google ou OTP por email no próprio `/meu-espaco` (ver `PortalLogin.tsx` + `PortalAuthContext`). Mesmo assim, o `support-agent` raramente sugere `send_portal_link` em tickets de "não consigo acessar", e quando sugere, o `support-execute-action` ainda gera token (`user_portal_tokens`) — inútil agora.

## Mudanças

### 1. `supabase/functions/support-execute-action/index.ts` — case `send_portal_link`
Remover toda a lógica de `user_portal_tokens` (select/insert). Retornar apenas:
```ts
stripeResponse = { portal_url: "https://olaaura.com.br/meu-espaco" };
success = true;
```
Nada mais. URL é pública e estática; o usuário loga lá com Google ou OTP por email.

### 2. `supabase/functions/support-agent/index.ts` — SYSTEM_PROMPT
- Atualizar a linha do catálogo de ações:
  `send_portal_link: enviar link de acesso ao /meu-espaco (login com Google ou código por email)`
- Adicionar bloco **REGRA DE ACESSO AO PORTAL (inviolável)**:
  - Se o ticket é sobre "não consigo entrar / esqueci a senha / como acesso / não recebi link / quero ver minhas sessões/cápsulas/jornadas no portal", `suggested_action.type` **deve ser** `send_portal_link`.
  - O `draft_body` **deve conter literalmente** a URL `https://olaaura.com.br/meu-espaco` (sem `?t=...`, sem placeholder), com instrução curta: "entre com o mesmo email da sua conta — você pode usar Google ou pedir o código de 6 dígitos por email".
  - **Nunca** redirecionar o cliente pro WhatsApp pra resolver acesso ao portal.
  - **Nunca** prometer "vou te enviar um link de login" como se fosse mágico — o link é a URL pública acima.

### 3. `mem/features/support/portal-access-resolution.md` (novo)
Memória curta:
- Portal usa login direto (Google + OTP email) em `/meu-espaco`, sem token na URL.
- Tickets de acesso → `send_portal_link` + URL literal no corpo.
- Não usar mais `user_portal_tokens` em respostas de suporte.

E adicionar referência em `mem://index.md` na seção Memories.

## Fora de escopo
- Não mexer no `AdminSupport.tsx` (não precisa de substituição de placeholder — AI escreve a URL direto).
- Não remover a tabela `user_portal_tokens` nem outros usos dela (`AdminUsers.tsx`, `customer-portal`) — fora do pedido.
- Não alterar `CRITICAL_ACTIONS` (`send_portal_link` continua não-crítica; se falhar, email ainda vai).
- Sem mudanças de RLS, schema, UI, Stripe/Asaas.

## Validação
Após deploy, regenerar um ticket de "como faço pra acessar minhas sessões?" e confirmar que:
1. `suggested_action.type === "send_portal_link"`.
2. `draft_body` contém `https://olaaura.com.br/meu-espaco` literal.
3. Aprovar com "Executar ação" marcado — não deve falhar (case simplificado).