

## Cápsula do Tempo: Fluxo com Confirmação

### O problema

Com o fluxo de "captura no primeiro áudio", o usuário pode:
- Enviar um áudio errado por engano
- Enviar só uma parte e querer refazer
- Mudar de ideia e querer regravar

### Solução: Etapa de confirmação antes de salvar

Em vez de salvar automaticamente o primeiro áudio, a Aura **confirma** antes de trancar a cápsula.

```text
Fluxo completo:

1. Aura propõe a cápsula
2. Usuário aceita ("quero", "bora", etc.)
3. profiles.awaiting_time_capsule = 'awaiting_audio'
4. Usuário envia áudio
5. webhook-zapi intercepta, salva temporariamente (audio_url + transcription)
   → profiles.awaiting_time_capsule = 'awaiting_confirmation'
   → profiles.pending_capsule_audio_url = <url>
6. Aura responde: "Recebi seu áudio! Ficou do jeito que você queria?
   Se quiser regravar, manda outro 🎙️"
7a. Usuário confirma ("sim", "ficou bom", "pode guardar")
   → Salva na tabela time_capsules com deliver_at = now() + 90 dias
   → Limpa flags do profile
   → Aura: "Guardei com carinho! Te envio de volta em [data] 💜"
7b. Usuário envia outro áudio
   → Substitui o pendente, repete etapa 6
7c. Usuário desiste ("deixa pra lá", "cancela")
   → Limpa flags, descarta áudio
   → Aura: "Tudo bem! Quando quiser, é só falar 💜"
8. Timeout de 24h sem resposta → limpa flags automaticamente
```

### Mudanças no banco

**Campo no `profiles`** (em vez de boolean):
- `awaiting_time_capsule text DEFAULT null` -- valores: `null`, `'awaiting_audio'`, `'awaiting_confirmation'`
- `pending_capsule_audio_url text DEFAULT null` -- URL temporária do áudio antes da confirmação

**Nova tabela `time_capsules`**:
- `id uuid PK`, `user_id uuid`, `audio_url text`, `transcription text`, `context_message text`, `deliver_at timestamptz`, `delivered boolean DEFAULT false`, `created_at timestamptz DEFAULT now()`

### Mudanças no código

**`webhook-zapi`**: Antes do fluxo normal, checar `profile.awaiting_time_capsule`:
- Se `'awaiting_audio'` e mensagem é áudio → salvar URL no profile, mudar estado para `'awaiting_confirmation'`, responder pedindo confirmação
- Se `'awaiting_confirmation'` e mensagem é áudio → substituir URL pendente, repetir confirmação
- Se `'awaiting_confirmation'` e mensagem é texto com confirmação → salvar em `time_capsules`, limpar flags
- Se `'awaiting_confirmation'` e mensagem é texto com cancelamento → limpar flags

**Prompt da Aura** (~5 linhas): Instrução para propor a cápsula naturalmente e aguardar aceitação

**Nova edge function `deliver-time-capsule`** (cron diário): Busca cápsulas com `deliver_at <= now()` e `delivered = false`, reenvia áudio via WhatsApp

**Limpeza automática**: O cron ou o próprio webhook reseta flags pendentes há mais de 24h

### Vantagem

O usuário tem controle total. Pode regravar quantas vezes quiser antes de confirmar. Zero risco de salvar áudio errado.

