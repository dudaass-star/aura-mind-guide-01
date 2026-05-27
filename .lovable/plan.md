
## Resumo

Hoje o portal `/meu-espaco` só consegue vincular o `auth.users` (login Google/OTP) ao `profiles` legado **pelo email**. Usuários que assinaram via WhatsApp/Stripe e cujo `profiles.email` está vazio (caso do Eduardo Santos, 51981519708) entram no portal e veem tudo zerado, mesmo tendo dados completos no banco.

Vou adicionar um **fallback por telefone**: se o email não bater, o portal pede o WhatsApp do usuário e usa esse número pra encontrar o profile legado.

## Mudanças

### 1. `link-portal-account` — aceitar telefone como fallback

Editar `supabase/functions/link-portal-account/index.ts`:

- Aceitar body opcional `{ phone?: string }`.
- Fluxo:
  1. Se já existe profile pro `auth.uid()` → retorna `alreadyLinked: true`.
  2. Tenta match por **email** no `profiles` (caminho atual).
  3. Se não achou e veio `phone` no body → normaliza com `normalizeBrazilianPhone` / `getPhoneVariations` (helpers em `_shared/zapi-client.ts`) e procura `profiles` por essas variações.
  4. Match encontrado → atualiza `profiles.user_id` para o novo `auth.uid()`, preenche `profiles.email` com o email do `auth.users` (se vazio), e propaga `user_id` nas mesmas 16 tabelas relacionadas que já estão hoje na função.
  5. Antes de vincular por telefone, valida que aquele profile **não está já vinculado a outro `auth.uid()` ativo** (proteção contra "roubar" conta de outra pessoa). Se já tem dono diferente → retorna `{ linked: false, reason: 'phone_taken' }`.
  6. Não encontrou nem por email nem por telefone → retorna `{ linked: false, reason: 'no_profile' }`.

### 2. UX no portal — pedir telefone quando email não bate

Editar `src/pages/UserPortal.tsx` (ou onde o `link-portal-account` é chamado hoje):

- Após o login Supabase, chamar `link-portal-account` sem body (tenta por email).
- Se retornar `{ linked: false, reason: 'no_profile' }` → renderizar um pequeno componente `<PhoneLinkPrompt />` em vez das abas:
  - Texto: "Pra encontrar sua conta, confirma o WhatsApp que você usa com a Aura."
  - Input de telefone (máscara `(DD) 9XXXX-XXXX`).
  - Botão "Confirmar" → chama `link-portal-account` com `{ phone }`.
  - Sucesso → recarrega a página e o portal renderiza normal.
  - `phone_taken` → erro "Esse número já está vinculado a outra conta. Fale com o suporte."
  - `no_profile` (telefone também não bateu) → erro "Não encontramos esse número. Confere o DDD ou fale com o suporte."

### 3. Bloquear sessão admin no portal

Em `UserPortal.tsx`, se `profile` é `null` **e** o usuário logado tem role `admin` (via `has_role`) → renderizar aviso "Você está logado como admin. Saia e entre com uma conta de usuário pra testar o portal." sem cair no fluxo de captura de telefone (evita admin testar e confundir dados).

## Fora de escopo

- Sem código OTP por WhatsApp/SMS (decisão atual — manter simples).
- Sem mudanças em RLS, Stripe, webhooks, ou no método de login (continua Google + OTP por email).
- Sem fix manual no banco pro Eduardo — ele vai usar o fluxo novo (item 2) na primeira vez que logar.

## Validação

1. Logar com Google/email cujo email **não existe** em `profiles` → portal mostra a tela do item 2.
2. Digitar `(51) 98151-9708` (Eduardo) → portal recarrega com 3 jornadas, plano `direcao`, resumos visíveis.
3. Logar de novo na mesma conta → cai em `alreadyLinked: true` (sem repetir a tela).
4. Tentar usar o telefone do Eduardo a partir de outra conta Google nova → retorna `phone_taken`.
5. Logar como admin e abrir `/meu-espaco` → vê o aviso do item 3.

## Detalhes técnicos

- A função `link-portal-account` já roda com `SERVICE_ROLE_KEY` e validação de JWT via `getClaims()` ([JWT Claims Borda](mem://technical/auth/edge-function-jwt-validation)).
- Helpers de telefone: `normalizeBrazilianPhone` e `getPhoneVariations` em `supabase/functions/_shared/zapi-client.ts` (mesmo padrão usado em `_shared/profile-resolver.ts` e `webhook-asaas`).
- Tabelas que recebem a propagação de `user_id` (mantém a lista atual): messages, sessions, session_themes, session_ratings, commitments, checkins, monthly_letters, monthly_reports, time_capsules, user_milestones, user_evolution_summary, weekly_questions, user_journey_history, scheduled_tasks, conversation_followups, aura_response_state.
- Validação do input de telefone com Zod no client antes de mandar pra função.
