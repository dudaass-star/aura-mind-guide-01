
## Objetivo

Parar de adivinhar. Mandar **1 mensagem real** pelo template de recuperação pro seu número (`+5551981519708`) usando a mesma subaccount/sender/template do fluxo de carrinho abandonado, e ler o **status final + error_code** que o Twilio devolver. A partir desse código a correção é cirúrgica.

## Passos

### 1. Disparo controlado (1 mensagem, seu número)
Chamar `test-recovery-template` com:
- `phone: "+5551981519708"`
- `contentSid: "HX7ae71f9002839ec0ecdc58f6aa067a8a"` (template 15min)
- `vars: { "1": "Robson" }`

Isso passa pelo mesmo caminho do cron: `sendRecoveryTemplate` → `postOnce` → `POST /Accounts/{TWILIO_RECOVERY_ACCOUNT_SID}/Messages.json` com `From = TWILIO_RECOVERY_FROM` (`whatsapp:+15559875290`).

Retorno esperado: `messageSid` (`MM...`) + status HTTP da criação (não da entrega).

### 2. Leitura do status final
Esperar ~10s e chamar `test-recovery-template` de novo com `messageSid` do passo 1. Isso faz `GET /Messages/{sid}.json` e devolve o campo crítico:

```
status:        queued | sent | delivered | undelivered | failed
error_code:    null | 63016 | 63018 | 63007 | 63032 | 131026 | ...
error_message: texto da Meta
date_sent:     null = nunca saiu da fila Twilio
```

### 3. Decisão pelo error_code

| error_code | Causa real | Correção |
|---|---|---|
| `null` + `delivered` | Chega normal | Problema é só nos **outros** números (normalização BR ou opt-in) — aplico fix do `normalizeBrazilianPhone` |
| `63016` | Fora de janela 24h sem template casado | ContentVariables não bate com `{{1}}` do template aprovado — ajusto payload |
| `63018` / `131047` | Janela 24h fechada / re-engagement | Template precisa ser categoria Utility, não Marketing |
| `63032` | Bloqueio por opt-in | Adiciono opt-in implícito ou trato no fluxo |
| `131026` | Receiver incapaz | Número de destino sem WhatsApp — caso específico, ignoro |
| `63007` | Channel não habilitado | Sender precisa habilitação no console Twilio |
| `63013` / `63021` | Template rejeitado ou usuário bloqueou | Reaprovar template / remover do alvo |

### 4. Bug colateral certo (independente do passo 3)
Mesmo se o teste passar, a `callback_url` da sender `+15559875290` aponta pro `webhook-twilio` (webhook da Aura principal). Respostas dos usuários do template de recuperação caem no fluxo errado.

Correção: apontar `callback_url` da sender pra um endpoint próprio (`webhook-twilio-recovery`, no-op + log) ou desativar callback nessa sender. Isso é ajuste no Twilio Console, não código — só sinalizo.

### 5. Reaplicar pelos lotes presos
Após corrigir a causa raiz, rodar `recover-abandoned-checkout-whatsapp` manualmente uma vez pra observar o novo comportamento em 3-5 mensagens, antes de deixar o cron destravado.

## O que NÃO vou fazer agora

- Não vou mexer no `normalizeBrazilianPhone` antes do passo 2 (seu teste vai dizer se o problema é phone ou template).
- Não vou trocar categoria do template antes de ver `error_code`.
- Não vou tocar no fluxo de e-mail nem no webhook principal da Aura.

## Próxima ação ao aprovar

Executar passo 1 + passo 2 e te trazer o JSON exato do Twilio (status, error_code, error_message). Depois aplico a correção da linha que aparecer na tabela.
