## Objetivo

Substituir o acesso por **token na URL** por um **login real e moderno** em `/meu-espaco`, e nesse mesmo movimento corrigir os 8 alertas de segurança.

---

## 1. Novo fluxo de login em `/meu-espaco`

Quando o usuário acessar `/meu-espaco` sem sessão ativa, mostra tela com 2 opções:

1. **Entrar com Google** (1 toque, recomendado)
2. **Entrar com Email** — usuário digita email → recebe código de 6 dígitos → digita código → entra

Sessão dura 30 dias com renovação automática. Após login, RLS funciona via `auth.uid()`, sem token na URL.

### Por que email (e não WhatsApp OTP)

- Se a janela de 24h do WhatsApp estiver fechada, OTP via WhatsApp não chega (ou exige template, que é lento e tem custo). Email é instantâneo e sem janela.
- É o padrão que todo mundo já conhece (Notion, Slack, Linear, Vercel).
- A Lovable Cloud já tem infraestrutura nativa de Email OTP (`signInWithOtp`).
- O email já está cadastrado em `profiles.email` para a maioria dos usuários (vem do Stripe).

### Templates de email com a marca Aura

Configurar templates customizados de auth email (Lovable Cloud auth-email-hook) para que o código chegue com:
- Domínio `notify.olaaura.com.br` (subdomínio dedicado, sem conflitar com `olaaura.com.br`)
- Visual da Aura (cor, logo, fonte)
- Texto curto: *"Seu código de acesso ao Meu Espaço: **123456**. Vale por 1 hora."*

### Vinculação com usuários existentes

Os 798 perfis atuais têm `phone` e `email` mas não têm `auth.users` correspondente. Na primeira vez que alguém logar:

- **Google ou Email OTP** → bate o email contra `profiles.email`. Se achar, edge function `link-portal-account` faz `UPDATE profiles SET user_id = <novo auth.uid()>` no perfil existente.
- Vinculação é idempotente e roda automaticamente logo após cada login.

### Compatibilidade com links antigos

Links `/meu-espaco?t=<token>` que a Aura já mandou continuam funcionando por **30 dias**. Depois disso, o token deixa de ser aceito e o usuário cai na tela de login. Aura passa a mandar só `https://olaaura.com.br/meu-espaco` (sem token).

---

## 2. Correção dos 8 alertas de segurança

| Finding | Correção |
|--------|----------|
| `monthly_reports` público | Remover policy `Anyone can read`. Manter só `auth.uid() = user_id` + service role. |
| `short_links` expõe telefones | Remover SELECT público. Resolução passa por edge function `resolve-short-link` que retorna só `url`. |
| `user_portal_tokens` totalmente público | Restringir SELECT só ao service role. Validação passa a ser via edge function `validate-portal-token` (mantém retrocompat por 30 dias). |
| Realtime sem RLS em `messages`/`support_tickets` | Adicionar RLS em `realtime.messages` filtrando por `auth.uid()`. |
| Bucket `aura-tts-audios` público | Tornar **privado**. URLs viram **signed URLs** (1h) geradas via edge function. |
| HIBP password protection desligado | Ativar via `configure_auth`. |
| `SECURITY DEFINER` executável por `anon`/`authenticated` | `REVOKE EXECUTE ... FROM anon, authenticated` nas funções internas. |
| Bucket público permite listing | Resolvido tornando `aura-tts-audios` privado. `meditations` continua público (conteúdo livre, intencional). |

---

## 3. Tarefas técnicas

```text
1. Habilitar Google OAuth (configure_social_auth)
2. Habilitar HIBP (configure_auth)
3. Configurar domínio de email + templates Aura para o OTP
   (notify.olaaura.com.br, scaffold auth-email-hook)
4. Migration:
   - drop policies públicas problemáticas
   - novas RLS em monthly_reports, short_links, user_portal_tokens
   - RLS em realtime.messages
   - bucket aura-tts-audios → private + policies
   - REVOKE EXECUTE em funções SECURITY DEFINER sensíveis
5. Edge functions novas:
   - link-portal-account (vincula auth.uid() ao profile existente por email)
   - resolve-short-link (redirect sem expor phone)
   - get-tts-signed-url (signed URL p/ áudio do bucket privado)
6. Frontend:
   - Nova página: /meu-espaco/entrar (Google + Email OTP)
   - UserPortal.tsx: usa useAuth() em vez de token na URL
     (mantém fallback ?t= por 30 dias)
   - Componentes do portal: queries passam a usar auth.uid()
7. Atualizar pontos da Aura que geram link do portal:
   - mandar só /meu-espaco (sem ?t=)
```

---

## 4. Detalhes importantes

- **Email OTP nativo da Lovable Cloud** — `supabase.auth.signInWithOtp({ email })` envia o código; `supabase.auth.verifyOtp({ email, token, type: 'email' })` valida e cria a sessão. Sem tabela `otp_codes` manual, sem rate limit caseiro — tudo gerenciado.
- **Rate limit**: a Lovable Cloud já aplica rate limit por IP/email no OTP.
- **Admin** continua com login email/senha próprio (`AdminLogin.tsx`) — sem mudança.
- **Templates**: enquanto o DNS do `notify.olaaura.com.br` não verifica, o OTP sai pelos templates padrão da Lovable Cloud (funciona, só não tem branding).

---

## O que NÃO está no escopo

- Migrar todos os 798 perfis pra `auth.users` agora — vinculação é lazy, acontece no primeiro login de cada um.
- Mexer no checkout/Stripe.
- Mexer no admin.
- WhatsApp OTP (descartado por causa da janela de 24h).
