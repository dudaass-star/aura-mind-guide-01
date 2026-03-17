

## Análise: O que ainda pode ser ajustado no prompt

Após a consolidação dos 6 frameworks, o prompt ficou mais limpo, mas ainda tem **3 problemas estruturais** que afetam o comportamento do modelo:

---

### Problema 1: Repetição excessiva da mesma regra em locais diferentes

A regra "1 pergunta por vez" aparece em **pelo menos 8 lugares diferentes** no prompt:
- Linha 599: "MÁXIMO 1 pergunta por turno"
- Linha 615-625: Seção inteira "REGRA CRÍTICA: UMA PERGUNTA POR VEZ"
- Linha 685: "só então faça 1 pergunta curta" (regra de áudio)
- Linha 797: "TERMINE com UMA pergunta que avance"
- Linha 1073: "faça 1 pergunta simples" (Ping-Pong)
- Linha 1140: "uma pergunta por resposta" (sessão)
- Linha 1151: "1 observação + 1 pergunta" (exploração)
- Linha 1862-1864: "Uma pergunta DIRECIONADA" (sessão dinâmica)

**Impacto:** Repetir a mesma regra 8 vezes não reforça — consome tokens e dilui as regras que realmente precisam de ênfase. O modelo já entendeu na primeira vez.

**Correção:** Manter a regra em 1 lugar canônico (linha 615) e remover as repetições. Nos outros locais, no máximo uma referência curta ("lembre: 1 pergunta por turno").

---

### Problema 2: Seções duplicadas que dizem a mesma coisa com palavras diferentes

**"LEITURA DO MOMENTO: PING-PONG vs PROFUNDO" (linhas 1032-1061)** e **"ESTRUTURA DE ATENDIMENTO" (linhas 1062-1114)** são quase idênticas:

- Ambas listam sinais de Ping-Pong vs Profundo
- Ambas explicam quando é conversa leve vs densa
- A seção "LEITURA DO MOMENTO" existe desde antes da consolidação e agora é redundante com a ESTRUTURA DE ATENDIMENTO

**Correção:** Eliminar a seção "LEITURA DO MOMENTO" inteira (linhas 1032-1061). A ESTRUTURA DE ATENDIMENTO já cobre tudo.

---

### Problema 3: Seções que podem ser compactadas sem perda

**a) "ESTILO AURA" (linhas 782-866) + "MÓDULO DE PROFUNDIDADE" (linhas 868-911):**
Ambas falam de "observar > perguntar", "ser direta", "provocar com gentileza". São o mesmo conceito em duas seções. Podem ser fundidas em uma só.

**b) "PADRÕES DE RESPOSTA" (linhas 912-941) repete conceitos já presentes no Modo Profundo e Modo Direção:**
- "Quando usuário desabafa" = Modo Profundo Fase 1
- "Quando usuário tá travado" = Modo Direção
- "Quando usuário repete padrão" = já coberto em "Detecção de Padrões" (linha 959)

**Correção:** Fundir "ESTILO AURA" + "MÓDULO DE PROFUNDIDADE" em uma seção "DNA DA AURA". Eliminar "PADRÕES DE RESPOSTA" (já cobertos pelos modos).

---

### Resumo das edições

| Ação | Linhas | Resultado estimado |
|------|--------|--------------------|
| Eliminar "LEITURA DO MOMENTO" | 1032-1061 | -30 linhas |
| Fundir "ESTILO AURA" + "MÓDULO DE PROFUNDIDADE" | 782-911 | -40 linhas |
| Eliminar "PADRÕES DE RESPOSTA" | 912-941 | -30 linhas |
| Deduplicar "1 pergunta por vez" (7 ocorrências redundantes) | Vários | -20 linhas |

**Total:** ~120 linhas a menos, sem perder nenhuma regra — apenas eliminando redundância.

### O que NÃO mexer
- Protocolo de Segurança (Nível 1/2/3) — crítico, bem escrito
- Protocolo de Condução (linhas 942-957) — complementar e único
- Detecção de Travamento em 2 camadas — acabou de ser implementado
- Regras de tags ([MEDITACAO], [AGENDAR_TAREFA], etc.) — operacionais, necessárias
- Regras de sessão — estruturadas e funcionais
- ESTRUTURA DE ATENDIMENTO — é a peça central agora

### Arquivo e deploy
- `supabase/functions/aura-agent/index.ts`
- Deploy: `aura-agent`

