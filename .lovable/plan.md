

# Ajustes no Prompt da Aura — Plano Revisado

## Mudanças no `supabase/functions/aura-agent/index.ts`

### 1. Limite de 300 chars no ping-pong (~linha 856)
Adicionar regra explícita: "Máximo 300 caracteres. Menos é mais. Frase curta, natural, como WhatsApp real."

### 2. Remover linguagem de validação forçada
- ~Linha 802: "Conexão com Afeto" → "Reaja de forma genuína, sem fórmulas"
- ~Linha 870: "valide a dor" → "esteja presente, sem script"

### 3. Tags estruturadas no prompt de fechamento (~linhas 1750-1769)
Instruir a Aura a incluir no encerramento:
- `[INSIGHT:texto]` — 2-3 por sessão
- `[COMPROMISSO:texto]` — 1-2 por sessão

### 4. Extração no código (~linha 4270)
Regex para capturar `[INSIGHT:...]` e `[COMPROMISSO:...]` do assistantMessage antes de chamar o Flash. Tags removidas da mensagem visível ao usuário.

### 5. Prompt de extração com proteção anti-alucinação (~linha 4294)
Trocar "Se não houver, deixe array vazio" por:

> "SEMPRE extraia pelo menos 2 insights da sessão. Para compromissos: se houver ação prática combinada, registre-a. Se não houver ação clara, registre a intenção emocional da sessão (ex: 'Me permitir sentir isso hoje sem culpa', 'Reconhecer que essa dor é válida'). Nunca invente ações que o usuário não mencionou."

Isso garante que o campo nunca volta vazio, mas sem alucinar compromissos práticos inexistentes.

## Arquivos alterados
- `supabase/functions/aura-agent/index.ts` — prompt + lógica de extração

