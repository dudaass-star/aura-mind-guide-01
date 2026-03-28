

## Disparo de email de aviso de indisponibilidade da Aura

### O que será feito

Criar uma edge function `notify-users-email` que envia um email de aviso para todos os usuários ativos/trial com email cadastrado, informando que a Aura está temporariamente fora e deve voltar hoje.

### Passos

**1. Criar edge function `notify-users-email`**
- Usa o Resend (API key já configurada: `RESEND_API_KEY`) para enviar os emails
- Busca todos os perfis com `status IN ('active', 'trial')` e `email IS NOT NULL`
- Deduplica emails (há duplicados no banco)
- Envia email HTML bonito e alinhado com a marca Aura (tons sage/verde)
- Conteúdo: aviso de manutenção temporária, previsão de retorno hoje, tom acolhedor
- Retorna relatório com quantos enviados/falhados
- Remetente: `noreply@` do domínio disponível ou um email genérico via Resend

**2. Adicionar botão no painel admin**
- Na página de engajamento (`AdminEngagement.tsx`) ou instâncias, adicionar um botão "Enviar Aviso por Email"
- Ao clicar, invoca a edge function
- Mostra resultado (X emails enviados, Y falhas)

### Conteúdo do email (sugestão)

**Assunto:** "Aura em manutenção — voltamos em breve 💚"

**Corpo:**
- Saudação personalizada com nome
- Explicação breve: estamos em manutenção para melhorar sua experiência
- Previsão: voltamos hoje à noite
- Reforço: seus dados e conversas estão seguros
- Tom acolhedor e tranquilizador

### Detalhes técnicos

- Edge function: `supabase/functions/notify-users-email/index.ts`
- Usa `RESEND_API_KEY` + `SUPABASE_SERVICE_ROLE_KEY` (ambos já configurados)
- Preciso verificar qual domínio de email está disponível no Resend para o remetente (ou usar `onboarding@resend.dev` para teste)
- Config em `supabase/config.toml`: `verify_jwt = false`
- Deduplica por email (lowercase) antes de enviar
- Rate limiting: pequeno delay entre envios para não bater limites do Resend

