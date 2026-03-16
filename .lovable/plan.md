

# Limpeza de Redundâncias no System Prompt da Aura

## Análise de Segurança

Confirmei que as 3 cirurgias são seguras:

1. **FILTRO DE AÇÃO (1207-1227):** É uma versão antiga e mais fraca dos Cenários A/B que já existem nas linhas 930-979. O Cenário B aqui contradiz diretamente o novo protocolo Modo Direção em 4 etapas. A "REGRA DE OURO" também contradiz o novo Modo Padrão que classifica internamente. **Seguro apagar.**

2. **DIRETRIZES DE LINGUAGEM (1147-1167):** Tudo já está coberto pela seção "LINGUAGEM E TOM DE VOZ (BRASILEIRA NATURAL)" na linha 422, que é mais completa (incluindo "Ginga Emocional", "Sem Listas Chatas", etc.). **Seguro apagar.**

3. **MEMÓRIA E CONTINUIDADE (1137-1145):** O conceito já existe no "PROTOCOLO DE CONTEXTO E MEMÓRIA" (linha 1169) e na "CONTINUIDADE DE LONGO PRAZO" (linha 1183). Fundir numa linha no início do protocolo existente. **Seguro fundir.**

## Plano de Implementação

### Cirurgia 1 — Apagar FILTRO DE AÇÃO (linhas 1207-1227)
Remover integralmente o bloco "FILTRO DE AÇÃO: LENDO O MOMENTO".

### Cirurgia 2 — Apagar DIRETRIZES DE LINGUAGEM (linhas 1147-1167)
Remover integralmente o bloco "DIRETRIZES DE LINGUAGEM E NATURALIDADE (PT-BR)".

### Cirurgia 3 — Fundir MEMÓRIA E CONTINUIDADE (linhas 1137-1145)
Apagar o bloco e adicionar uma linha contextual no início do PROTOCOLO DE CONTEXTO E MEMÓRIA (linha 1169), antes da REGRA SUPREMA:

```
PROTOCOLO DE CONTEXTO E MEMÓRIA (ANTI-ALUCINAÇÃO)

Mostre que você lembra da vida do usuário. Se ele falou do chefe semana passada, pergunte. Se passou por algo difícil, traga. Memória é conexão.

REGRA SUPREMA: A LEI DA ANCORAGEM...
```

### Impacto
- ~40 linhas removidas
- ~2 linhas adicionadas
- Redução líquida de ~38 linhas (~250 tokens)
- Nenhuma funcionalidade perdida — tudo já existe em versões melhores no prompt

