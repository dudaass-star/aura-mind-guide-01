

## Plano: Nudge automática 1h após cadastro para ghost trials

### Contexto
Já existe um `trial_activation_audio` agendado para +15min que envia um áudio se o usuário não respondeu. A nova nudge será uma mensagem de texto ~1h após o cadastro, com tom mais direto, caso o usuário continue sem responder.

### Mudanças

**1. `supabase/functions/start-trial/index.ts`**
- Agendar nova `scheduled_task` com `task_type: 'trial_ghost_nudge'` para +60 minutos após o cadastro
- Mesma estrutura do `trial_activation_audio` já existente (linhas 204-216)

**2. `supabase/functions/execute-scheduled-tasks/index.ts`**
- Adicionar novo case `'trial_ghost_nudge'` no switch de task types
- Verificar se `trial_conversations_count === 0` e `status === 'trial'` antes de enviar (mesmo padrão do `trial_activation_audio`)
- Mensagem algo como: "Oi, {nome}! Vi que você ainda não respondeu... Não precisa de nenhum preparo, é só me contar como está se sentindo agora. Tô aqui 💜"
- Salvar na tabela `messages` para manter histórico

### Fluxo temporal do trial
```text
0min  → Welcome message + msg de áudio
+15min → trial_activation_audio (áudio TTS se não respondeu)
+60min → trial_ghost_nudge (texto se ainda não respondeu)  ← NOVO
```

### Arquivos afetados
1. `supabase/functions/start-trial/index.ts` — agendar task
2. `supabase/functions/execute-scheduled-tasks/index.ts` — handler do novo tipo

