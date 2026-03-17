

## Análise dos 4 pontos — todos fazem sentido

### Ponto 1: ENCERRAMENTO COM GANCHO no lugar errado ✅
Confirmado. Linhas 1307-1316 estão no fluxo geral, fora do bloco de sessões. O modelo aplica ganchos em conversas comuns de WhatsApp.
**Ação:** Mover para dentro do bloco de sessão (fase de Transição/Fechamento).

### Ponto 2: CONTEXTO TEMPORAL duplicado ✅
Confirmado. Linhas 1318-1326 dizem "consulte o bloco DADOS DINÂMICOS DO SISTEMA" — mas o bloco já é injetado automaticamente (linha 3511+) e já tem instruções de uso (linha 747-751). É instrução sobre instrução.
**Ação:** Remover linhas 1318-1326 inteiramente.

### Ponto 3: 124+ ocorrências de PROIBIDO/NUNCA/JAMAIS ✅
Confirmado — encontrei **150 matches**. Muitas são redundantes ou cobrem cenários óbvios. Exemplos de candidatos a remoção:
- "NUNCA agende no passado" (o código valida isso)
- Repetições de "PROIBIDO" em exemplos que já ilustram a regra
- Proibições que são o inverso de regras positivas já escritas

**Ação:** Revisar cada ocorrência e consolidar. Manter apenas proibições de risco real (segurança, crise, identidade). Converter o resto em instruções positivas. Meta: ~40-50 ocorrências.

### Ponto 4: [VALOR_ENTREGUE] como sinal de "missão cumprida" ✅
Confirmado. A instrução (linhas 3755-3771) diz "quando entregar algo ACIONÁVEL, adicione a tag" mas não diz que a conversa continua. O modelo marca a tag e encerra.
**Ação:** Adicionar à instrução: "A tag marca progresso parcial — a conversa CONTINUA após valor entregue. Entrega de valor é sinal para aprofundar, não para encerrar."

---

### Implementação

**Arquivo:** `supabase/functions/aura-agent/index.ts`

1. **Mover "ENCERRAMENTO COM GANCHO"** (linhas 1307-1316) para dentro do protocolo de sessão, na fase de Transição/Fechamento
2. **Remover "CONTEXTO TEMPORAL"** (linhas 1318-1326)
3. **Revisar 150 ocorrências de PROIBIDO/NUNCA/JAMAIS** — consolidar em instruções positivas onde possível, manter apenas proibições críticas (segurança, crise, identidade da Aura)
4. **Ajustar instrução [VALOR_ENTREGUE]** (linhas 3755-3771) — explicitar que é marco parcial, conversa continua

**Deploy:** `aura-agent`

