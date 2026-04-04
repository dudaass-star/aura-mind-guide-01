
## Plano: Templates fixos do WhatsApp para mensagens fora da janela de 24h

### Contexto

Aprendemos que a variável `{{1}}` dos templates WhatsApp da Meta **só funciona com conteúdo curto** (nome). A estratégia agora é: templates com mensagem fixa + apenas `{{1}}` = nome do usuário.

### Templates a criar/atualizar

Precisamos de **4 templates** com texto fixo para submeter à Meta via Twilio. Abaixo, o texto exato de cada um (incluindo o `{{1}}` para o nome):

---

**1. Check-in (7 dias sem interação)**
- Template name: `aura_checkin_v2`
- Categoria Meta: `marketing`
- Texto completo para submissão:

```
Oi, {{1}}! Faz um tempinho que a gente não conversa... 💜

Como você está? Estou aqui sempre que precisar, é só me chamar.

— Aura
```

---

**2. Acesso bloqueado (pagamento falhou)**
- Template name: `aura_access_blocked_v2`
- Categoria Meta: `utility`
- Texto completo para submissão:

```
Oi, {{1}}! Tivemos um probleminha com o seu pagamento. 💜

Para continuar com o nosso acompanhamento, atualize seus dados de pagamento pelo link que enviamos no seu e-mail.

Qualquer dúvida, estou aqui!

— Aura
```

---

**3. Reativação (usuário inativo)**
- Template name: `aura_reactivation_v2`
- Categoria Meta: `marketing`
- Texto completo para submissão:

```
Oi, {{1}}! Senti sua falta por aqui. 💜

Quando quiser conversar, é só me chamar. Estou sempre aqui por você.

— Aura
```

---

**4. Reconexão (instância reconectou)**
- Template name: `aura_reconnect_v2` — **já aprovado e ativo** ✅
- Texto atual precisa ser verificado. Se o texto aprovado já é curto e fixo, basta ajustar a variável para enviar **só o nome**.

---

### Alterações no código

**1. Atualizar funções que enviam essas mensagens para usar `templateVariables: [nome]`:**

- `supabase/functions/scheduled-checkin/index.ts` — Ao chamar `sendProactive`, passar `templateVariables: [nome]` para que, fora da janela, o template envie só o nome na variável. O texto dinâmico completo continua sendo enviado dentro da janela (free text).

- `supabase/functions/instance-reconnect-notify/index.ts` — Idem, passar `templateVariables: [nome]`.

- `supabase/functions/reactivation-check/index.ts` — Nas mensagens de missed session e trial nudges, passar `templateVariables: [nome]`.

- `supabase/functions/stripe-webhook/index.ts` — No fluxo de `payment_failed`, além do email de dunning que já envia, adicionar envio WhatsApp com template `access_blocked` + `templateVariables: [nome]`.

**2. Atualizar prefixes na tabela `whatsapp_templates`:**

Os prefixes atuais na tabela serão substituídos pelos textos completos (sem a variável) quando os templates forem aprovados e o ContentSid for atualizado.

### O que você precisa fazer manualmente

1. Criar os 3 templates (checkin, access_blocked, reactivation) no Twilio Content Editor com o texto exato acima
2. Submeter para aprovação da Meta
3. Após aprovação, copiar os `ContentSid` e atualizar na página `/admin/templates`

### Falta alguma coisa?

Verificando o mapeamento completo:

| Cenário | Dentro 24h | Fora 24h | Status |
|---------|-----------|----------|--------|
| Check-in 7d | Texto livre personalizado | Template fixo (novo) | **A criar** |
| Acesso bloqueado | Texto livre + email | Template fixo + email | **A criar** |
| Reativação | Texto livre personalizado | Template fixo (novo) | **A criar** |
| Reconexão | Texto livre | Template fixo (existente) | ✅ Ativo |
| Lembrete sessão | Texto livre (24h+5min) | Sempre dentro da janela* | Verificar |
| Follow-up | Texto livre | Não envia (guard 24h) | ✅ Feito |
| Resumo mensal | Teaser + link | Teaser + link (template?) | **Possível 5o template** |
| Cápsula do tempo | Teaser + link | Teaser + link (template?) | **Possível 6o template** |
| Meditação | Áudio direto | Dentro da janela sempre | ✅ OK |
| Welcome/Trial | Template curto | Janela sempre aberta | ✅ Ativo |
| Insight | Texto livre | Não envia (por agora) | ✅ OK |

**Possíveis templates adicionais:** Se o resumo mensal e a cápsula do tempo precisam chegar fora da janela, seria bom criar templates curtos tipo:
- `"Oi, {{1}}! Seu resumo mensal está pronto 📊 Veja aqui: {{2}} — Aura"`
- `"Oi, {{1}}! Sua cápsula do tempo chegou 💜 Ouça aqui: {{2}} — Aura"`

Esses teriam {{2}} = link curto. Mas podem ficar para uma segunda fase.

### Sequência de implementação

1. Atualizar `scheduled-checkin`, `reactivation-check`, `instance-reconnect-notify` para passar `templateVariables: [nome]`
2. Adicionar envio WhatsApp no `stripe-webhook` para `payment_failed` com template `access_blocked`
3. Você cria os templates no Twilio e submete para a Meta
4. Após aprovação, atualiza os ContentSid no admin

