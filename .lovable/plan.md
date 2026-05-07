## Objetivo
Enviar uma única mensagem padrão de recuperação para os 11 usuários impactados pela falha do `aura-agent` em 07/05, retomando rapidamente as conversas.

## Mensagem única (PT-BR, tom Aura)
> "Oi, [nome]! Tive uma instabilidade técnica agora pela manhã e suas mensagens não chegaram em mim na hora — eu li tudo agora. Não foi você, fui eu que falhei. Tô aqui de volta. Continua daqui comigo? 💜"

- `[nome]` substituído pelo primeiro nome do `profiles.name` (fallback: sem nome → "Oi! Tive uma instabilidade...").
- Enviada como **texto livre** via `admin-send-message` (categoria `checkin`) — todos os 11 usuários trocaram mensagem nas últimas 24h, então a janela WhatsApp está aberta e não precisa de template.

## Execução (one-shot script)
Script Deno avulso rodado via `code--exec` que:
1. Lê os 11 `user_id` da lista já identificada (Eduardo, Aline, Beatriz, Jéssica, Daiane, Angela, Jeniffer, Alexandre, FRANKLIN, Nivea, Michele).
2. Para cada um: busca `name` + `phone` em `profiles`, monta a mensagem com primeiro nome, e invoca `admin-send-message` com `{ phone, message, user_id, template_category: 'checkin' }`.
3. Espera ~1.5s entre envios (anti-burst Twilio).
4. Loga sucesso/falha por usuário e grava cada mensagem em `messages` (já feito automaticamente pela própria `admin-send-message`).

## Detalhes técnicos
- Não cria nova edge function — usa a existente `admin-send-message` que já trata `cleanPhoneNumber`, `sendProactive`, instance config e gravação em `messages`.
- Autenticação: chamada server-side com `SUPABASE_SERVICE_ROLE_KEY` direto via `fetch` ao endpoint da função.
- Sem alteração de schema, sem migração, sem novo arquivo no repo.

## Validação após envio
- Conferir nos logs de `admin-send-message` que houve 11 `✅ Message sent`.
- Conferir no `messages` que cada `user_id` recebeu a linha `role=assistant` com o texto.
- Aguardar respostas via webhook normal (Aura já está operando).
