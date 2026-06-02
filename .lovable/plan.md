## Objetivo
Resolver o cliente travado no acesso ao /meu-espaco, cobrindo os 3 problemas identificados (loop do WhatsApp, fallback de telefone fraco, e código de 6 dígitos ausente no email).

## Mudanças

### 1. Email de Magic Link — incluir código + link
- Atualizar o template de Magic Link do Supabase Auth para entregar **ambos**: `{{ .Token }}` (código de 6 dígitos) e `{{ .ConfirmationURL }}` (link clicável).
- Texto sugerido (PT-BR, tom Aura):
  - "Seu código de acesso: **{{ .Token }}**"
  - "Ou clique aqui para entrar direto: {{ .ConfirmationURL }}"
  - "O código expira em 1 hora."

### 2. UI do PortalLogin — clareza no fluxo
- Mensagem após envio: "Enviamos um **código de 6 dígitos** e um **link** pro seu email. Use qualquer um dos dois."
- Texto auxiliar no campo do código: "Não chegou? Confere o spam ou clica no link do email."
- Garantir que `onAuthStateChange` continua tratando o caso do link (já tratado pelo `PortalAuthContext`, só validar).

### 3. Tela "Confirma seu WhatsApp" — sem loop e sem placeholder confuso
- Trocar o placeholder hardcoded `(51) 98151-9708` por `(DDD) 90000-0000`.
- Mensagem mais clara: explicar que é o WhatsApp cadastrado na assinatura.
- Em caso de falha (email + telefone não batem), mostrar mensagem de erro explícita ao invés de voltar pra mesma tela em loop. Oferecer botão "Falar com suporte".

### 4. `link-portal-account` — fallback de telefone robusto
- Normalizar comparação aceitando variantes:
  - com/sem prefixo `55`
  - com/sem 9º dígito
  - formatos nacionais com máscara
- Logar tentativa (sucesso/falha) pra auditoria.

### 5. `/meu-espaco` — compatibilidade com `?t=<token>` legado
- Reconhecer query param `t` na rota e resolver via função segura (sem expor dados via RLS pública).
- Se token válido → cria sessão do portal automaticamente.
- Se inválido/expirado → redireciona pra `PortalLogin` com mensagem clara.

### 6. Validação específica do Marcelo (antunesmarce@gmail.com)
- Confirmar/criar `user_portal_token` pra ele.
- Testar 3 caminhos: Google login, email+código, link direto.
- Confirmar que não cai mais no loop do "Confirma seu WhatsApp".

## Detalhes Técnicos

- **Template Auth**: editado via Supabase Dashboard (Authentication → Email Templates → Magic Link). O `signInWithOtp()` já envia `{{ .Token }}` se presente no template — sem mudança de código.
- **PortalLogin.tsx**: ajuste só de copy + microcopy.
- **WhatsAppConfirm screen**: placeholder + tratamento de erro (não loopar, mostrar mensagem).
- **link-portal-account edge function**: nova helper `normalizePhoneVariants(phone)` que gera array de variantes e busca `profiles` por `IN`.
- **MeuEspaco route**: parsing do `?t=` no `useEffect` inicial, chamada a nova edge function `resolve-portal-token` (já existente ou criar) que retorna `magic_link` pra completar auth.
