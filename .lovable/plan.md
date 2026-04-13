

## Plano: Template `sessao_inicio` só no lembrete de 5 min + início imediato ao clicar

### Resumo da mudança

O template oficial `sessao_inicio` será usado **somente** no lembrete de 5 minutos antes da sessão. Para o lembrete de 24h e a notificação de início, usaremos texto livre apenas se a janela de 24h estiver aberta. Quando o usuário clicar no botão do template de 5 min, a sessão inicia imediatamente.

### Mudanças

#### 1. `session-reminder/index.ts` — Lembrete de 24h
- **Antes**: `sendProactive(phone, message, 'session_reminder', userId)` → usa template se janela fechada
- **Depois**: Verificar janela de 24h manualmente. Se aberta, enviar como texto livre (`sendFreeText`). Se fechada, **pular** (não enviar template — o template será reservado para os 5 min)

#### 2. `session-reminder/index.ts` — Lembrete de 5 min
- **Antes**: `sendProactive(phone, message, 'session_reminder', userId)` → decide automaticamente
- **Depois**: Sempre usar `sendProactive(phone, message, 'session_reminder', userId)` com a adição de salvar `pending_insight` com marcador `[SESSION_START]` + dados da sessão para que, ao clicar no botão do template, a Aura inicie a sessão imediatamente

#### 3. `session-reminder/index.ts` — Notificação de início de sessão (bloco "sessionsToStart")
- **Antes**: `sendProactive(phone, message, 'session_reminder', userId)` → usa template se janela fechada
- **Depois**: Usar texto livre apenas se janela aberta. Se janela fechada, pular (o template de 5 min já foi enviado)

#### 4. `aura-agent/index.ts` — Detectar clique no botão do template
- Adicionar detecção do marcador `[SESSION_START]` no `pending_insight`
- Quando detectado: iniciar sessão imediatamente (mudar status para `in_progress`, setar `started_at`, limpar `pending_insight`)
- Enviar mensagem de abertura da sessão

### Fluxo final

```text
24h antes (janela aberta)  → texto livre com preview da sessão
24h antes (janela fechada) → NÃO envia (sem desperdício de template)
5 min antes                → template sessao_inicio + pending_insight [SESSION_START]
Clique no botão            → aura-agent detecta, inicia sessão imediatamente
Horário da sessão          → texto livre SE janela aberta E sessão não iniciada
```

### Arquivos modificados
- `supabase/functions/session-reminder/index.ts`
- `supabase/functions/aura-agent/index.ts`

### Detalhes técnicos
- Importar `isWithin24hWindow` e `sendFreeText` de `whatsapp-official.ts` no session-reminder
- O `pending_insight` para `[SESSION_START]` conterá o session ID para garantir que a sessão correta é iniciada
- O bloco existente de confirmação de sessão no aura-agent será adaptado para detectar o marcador antes de pedir confirmação verbal

