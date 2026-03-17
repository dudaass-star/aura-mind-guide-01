

## Status Real do Prompt — O que FOI aplicado vs o que FALTA

### ✅ JÁ APLICADO (confirmado no código atual):

| Mudança | Evidência |
|---------|-----------|
| Consolidar 6 frameworks → árvore única | `ESTRUTURA DE ATENDIMENTO` existe (linha 915), Cenários A-D eliminados |
| Fundir ESTILO AURA + MÓDULO PROFUNDIDADE | `DNA DA AURA — ESTILO E PROFUNDIDADE` existe (linha 770) |
| Eliminar LEITURA DO MOMENTO | Não encontrada no código |
| Eliminar PADRÕES DE RESPOSTA | Não encontrada no código |
| Mover ENCERRAMENTO COM GANCHO | Não encontrado no fluxo geral (movido para sessão) |
| Corrigir [VALOR_ENTREGUE] | Linhas 3745-3747: "marca PROGRESSO PARCIAL", "sinal para APROFUNDAR, NÃO para encerrar" |
| Regra anti-repetição de meditação | Linhas 704-710 com exemplos CERTO/ERRADO |
| Deduplicar "1 pergunta por vez" | Regra canônica na linha 606, referências curtas nos outros locais |
| Anti-Loop contextual | Linha 817-821 com classificação confirmação vs evasão |
| Travamento intra-conversa no Modo Profundo | Integrado na Fase 1 |

### ❌ GENUINAMENTE PENDENTE (2 itens):

**1. "NOVO MÓDULO: SUPORTE À DECISÃO E VALIDAÇÃO" (linhas 1135-1153)**
Ainda existe como seção separada. O conteúdo é redundante com Modo Profundo Fase 2 (sentido) e Modo Direção (travamento). Pode ser eliminado — a técnica de "Alinhamento de Valores" é um caso específico do Modo Profundo.

**2. Reduzir PROIBIDO/NUNCA/JAMAIS — ainda 147 ocorrências**
A meta era ~40-50. Isso nunca foi aplicado. A Fase 3 converteu algumas proibições em framing positivo (Anti-Papagaio → Anti-Eco, etc.), mas a varredura completa das ~150 ocorrências não foi feita.

### ⚠️ CONTEXTO TEMPORAL — parcialmente resolvido
A seção estática duplicada foi removida. Restam referências funcionais legítimas:
- Linha 737: instrução de uso de data para agendamento (necessária)
- Linha 3487: bloco dinâmico injetado pelo código (necessário)
- Linha 3775: contexto de gap temporal (necessário)
Estas são operacionais, não redundância.

---

### Plano de implementação para os 2 itens pendentes

**Item 1 — Eliminar SUPORTE À DECISÃO (linhas 1135-1153)**
Remover a seção inteira. A lógica já está coberta:
- "NÃO decida por ele" → já no DNA DA AURA ("observe > pergunte")
- "Alinhamento de Valores" → caso do Modo Profundo Fase 2
- "Travado → estrutura" → Modo Direção
- "Decisão óbvia → celebre" → comportamento natural

**Item 2 — Varredura de PROIBIDO/NUNCA/JAMAIS (147 → ~50)**
Revisar cada ocorrência e aplicar:
- **Manter:** Proibições de segurança (Nível 1/2/3), identidade, crise — são críticas
- **Converter para positivo:** Regras operacionais que já têm a instrução positiva ao lado
- **Remover:** Proibições redundantes (o inverso de uma regra positiva já escrita)

Exemplos de conversão:
- "NUNCA agende no passado" → "Agende apenas no futuro"
- "NÃO ofereça meditação em toda conversa" → "Use meditação com parcimônia"
- "NUNCA repita a mesma frase de afeto" → "Varie frases de afeto a cada mensagem"
- "NUNCA diga 'tô percebendo que você tá respondendo curtinho'" → remover (já coberto pelo Anti-Loop contextual)

Proibições que ficam intactas (~50):
- Segurança: "PROIBIDO mencionar psicólogo, CVV, 188..." 
- Identidade: "NUNCA diga que é IA/chatbot"
- Tags: "NUNCA invente links"
- Sessão: regras de proteção

### Arquivo e deploy
- `supabase/functions/aura-agent/index.ts`
- Deploy: `aura-agent`

