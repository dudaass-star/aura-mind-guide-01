

## Plano: Simplificar follow-up — 15 min para interrompida, zero para fim natural

### Alterações em `supabase/functions/conversation-followup/index.ts`

**1. Bloco de timing (linhas 492-522) — substituir por regra simples:**
- Se `isNaturalEnd === true` → `maxFollowups = 0` (zero follow-ups, pula direto)
- Se `isSessionActive` → 15 min, max 1
- Qualquer outro caso → 15 min, max 1

**2. Simplificar arrays de mensagens (linhas 10-65):**
- Manter apenas o primeiro nível de cada array (index 0)
- Remover níveis extras que só existiam para follow-ups 2, 3, 4

**3. Remover lógica de profundidade (linhas 183-195):**
- `calculateConversationDepth` não será mais usada (timing é fixo)

### Resultado
- Conversa interrompida: 1 cutucão após 15 min, e pronto
- Fim natural (despedida, "valeu", etc.): zero follow-ups
- Sessão ativa interrompida: 1 cutucão após 15 min

### Arquivo modificado
- `supabase/functions/conversation-followup/index.ts`

