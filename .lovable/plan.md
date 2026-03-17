

## Análise: O que ainda pode ser ajustado no prompt

Após 4 fases de otimização, o prompt está significativamente mais limpo. Restam **3 problemas concretos** que ainda afetam o fluxo:

---

### Problema 1: Seções de referência redundantes (linhas 1365-1390)

As linhas 1365-1390 são **6 seções "consulte o bloco DADOS DINÂMICOS"** que não fazem nada — o modelo já recebe o bloco dinâmico como segundo system message. São instruções meta que ocupam ~25 linhas dizendo ao modelo para ler algo que ele já lê:

- "CONTEXTO DO USUÁRIO (MEMÓRIA ATUAL)" → "Consulte o bloco DADOS DINÂMICOS"
- "SOBRE SUA MEMÓRIA (IMPORTANTE!)" → lista dados que já estão no bloco dinâmico
- "MEMÓRIA DE LONGO PRAZO" → "Consulte o bloco DADOS DINÂMICOS"
- "TIMESTAMPS NAS MENSAGENS" → instrução útil mas pode ser 2 linhas
- "REGRA DE ÁUDIO NO INÍCIO DE SESSÃO" → "Consulte o bloco DADOS DINÂMICOS"

**Ação:** Condensar linhas 1365-1390 em ~5 linhas. Manter apenas a instrução de timestamps (útil) e a instrução de conexões entre conversas (útil). Remover todas as referências "consulte o bloco dinâmico".

---

### Problema 2: Duplicação entre "ESTRUTURA DA RESPOSTA" e "ESTRUTURA DE ATENDIMENTO"

Duas seções fazem o mesmo trabalho:
- **"ESTRUTURA DA RESPOSTA (CONDICIONAL)"** (linhas 848-893): Define Modo Profundo (Fases 1-3) e Ping-Pong
- **"ESTRUTURA DE ATENDIMENTO (FORA DE SESSÃO)"** (linhas 895-944): Define Ping-Pong, Profundo, Direção, Emergência

Ambas classificam mensagens e dizem qual modo seguir. A "ESTRUTURA DA RESPOSTA" detalha as fases do Modo Profundo, enquanto a "ESTRUTURA DE ATENDIMENTO" lista os 4 modos com regras de classificação.

**Ação:** Fundir as duas seções em uma só. As Fases 1-3 do Modo Profundo ficam como sub-seção dentro do modo PROFUNDO da ESTRUTURA DE ATENDIMENTO. Eliminar a seção "ESTRUTURA DA RESPOSTA" como wrapper separado. Estimativa: -15 linhas.

---

### Problema 3: "PROTOCOLO DE CONTEXTO E MEMÓRIA" redundante (linhas 1091-1109)

Esta seção (linhas 1091-1109) cobre:
- "Mostre que você lembra da vida do usuário" → já está no DNA DA AURA ("ANTECIPE, NÃO SONDE")
- "REGRA SUPREMA: LEI DA ANCORAGEM" → útil e única, mas poderia ser 3 linhas
- "CONTINUIDADE DE LONGO PRAZO" → redundante com o contexto dinâmico de compromissos e temas

**Ação:** Mover a "Lei da Ancoragem" (5 linhas essenciais) para dentro do DNA DA AURA. Eliminar o resto (~15 linhas).

---

### Resumo

| Ação | Linhas | Resultado |
|------|--------|-----------|
| Condensar seções "consulte bloco dinâmico" | 1365-1390 | -20 linhas |
| Fundir ESTRUTURA DA RESPOSTA + ESTRUTURA DE ATENDIMENTO | 848-944 | -15 linhas |
| Condensar PROTOCOLO DE CONTEXTO E MEMÓRIA | 1091-1109 | -15 linhas |

**Total:** ~50 linhas a menos, sem perda de lógica.

### O que NÃO mexer
- Protocolo de Segurança (Nível 1/2/3)
- DNA DA AURA
- Detecção de Travamento (2 camadas)
- Regras de tags e sessões
- ESTRUTURA DE ATENDIMENTO (mantida como peça central, apenas absorve conteúdo)
- Bloco dinâmico e código TypeScript

### Arquivo e deploy
- `supabase/functions/aura-agent/index.ts`
- Deploy: `aura-agent`

