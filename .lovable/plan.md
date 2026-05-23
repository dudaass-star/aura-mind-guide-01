
## Sintomas observados no banco

Olhando `checkout_recovery_attempts` (últimos dias):

- 419 mensagens com `status = wa_stage_1_sent` e 408 com `wa_stage_2_sent` — pelo lado da Aura "deu certo" (Twilio aceitou e devolveu um SID `MM...`).
- Mas o `provider_response` mostra todas presas em `status: "queued"`, `date_sent: null`, `error_code: null`. Ou seja: o Twilio recebeu, mas a mensagem **nunca foi entregue** ao usuário no WhatsApp.
- Além disso, há **2 problemas reais** já visíveis nos logs:
  1. **136 falhas com erro "Authenticate"** — credenciais da subaccount (`TWILIO_RECOVERY_ACCOUNT_SID` / `TWILIO_RECOVERY_AUTH_TOKEN`) ficaram inválidas em algum momento (token rotacionado? subaccount suspensa?).
  2. **Bug de normalização de telefone**: números BR com 11 dígitos que já incluem `55` no começo (ex.: `55889314183`, DDD 88) recebem mais um `55` e viram `5555889314183` (15 dígitos, inválido). Outros casos viraram `+11978060363` (sem o 55, US-like) — Twilio rejeita com "not a valid phone number".

A hipótese inicial ("número não tem nome aprovado pela Meta") já foi descartada pelo usuário: o número principal da Aura roda sem name approval e funciona. Então o problema é **configuração da subaccount + bug de normalização + falta de visibilidade do status final**, não Meta name approval.

## O que vou fazer

### 1. Diagnóstico real (script de leitura, não muda nada)

Script que pega os últimos 20 SIDs `MM...` salvos em `provider_response` e consulta a API do Twilio (`GET /Messages/{sid}.json`) para descobrir o **status final real** de cada um: `sent`, `delivered`, `failed`, `undelivered` + `error_code` + `error_message`.

Isso vai dizer **exatamente** porque não chega:
- Se vier `error_code: 63016` → fora da janela de 24h e template não casou (precisa de template aprovado para conversa nova).
- Se vier `63007` → sender `whatsapp:+15559875290` não está habilitado para WhatsApp Business.
- Se vier `63018` → opt-in obrigatório.
- Se vier `delivered` → mensagem chega, problema é só percepção.

### 2. Corrigir bug de normalização de telefone BR

Em `supabase/functions/_shared/zapi-client.ts`, `normalizeBrazilianPhone`:

- Hoje: se input tem 10 ou 11 dígitos, prefixa `55` cegamente. Isso quebra para DDDs que começam com `5` ou `8` quando o usuário já digitou `55` no começo.
- Correção: antes de prefixar, **detectar se já começa com `55` e tem 12-13 dígitos válidos** (DDD BR válido 11-99). Se sim, não prefixa. Adicionar também tratamento explícito para números que entram como `+5511...` vs `5511...` vs `11...`.

### 3. Validar credenciais da subaccount

Adicionar um endpoint de health-check (`test-recovery-template` já existe — estender com um modo `healthcheck` que faz `GET /Accounts/{sid}.json`). Se voltar 401, peço para reconfigurar `TWILIO_RECOVERY_AUTH_TOKEN`.

### 4. Adicionar `StatusCallback` no envio

Em `twilio-recovery-client.ts → postOnce`, incluir parâmetro `StatusCallback` apontando para uma nova edge function `twilio-recovery-status-webhook` que:
- Recebe o webhook do Twilio com status final (`delivered`, `failed`, etc.) + `ErrorCode`.
- Atualiza a linha correspondente em `checkout_recovery_attempts` com status real e mensagem de erro.

Assim a gente para de "achar" que enviou 800+ mensagens com sucesso quando na verdade o Meta pode estar rejeitando todas.

### 5. (Depende do passo 1) Ajuste de sender/template

Com o diagnóstico em mãos, aplico a correção pontual:
- Se for problema de janela 24h + template não-utility, ajusto categoria.
- Se for sender não habilitado, oriento a habilitação no console Twilio (não dá para automatizar).
- Se for problema de variable mismatch (ex.: template tem `{{1}}` e `{{2}}` mas mando só `{{1}}`), corrijo no payload.

## Ordem de execução

1. Rodar diagnóstico (passo 1) — leitura pura, sem deploy.
2. Mostrar resultado para você e confirmar a causa raiz.
3. Aplicar correções 2, 3, 4 em paralelo (mudanças seguras e isoladas).
4. Aplicar correção 5 conforme o diagnóstico.

Quer que eu siga assim?
