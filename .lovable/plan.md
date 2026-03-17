

## Consolidação dos frameworks comportamentais do prompt

### Concordo com sua mudança

A distinção faz total sentido. Travamento **intra-conversa** (Micheli: "Certo → Certo → Ok") é padrão em tempo real que o modelo precisa detectar no prompt. Travamento **inter-conversas** (Luciana voltando 3x com o mesmo tema) já tem dados no banco (`user_insights`, `commitments`, `session_themes`) e deve vir no contexto dinâmico.

### O que existe hoje (6 frameworks sobrepostos)

| # | Framework | Linhas | Função |
|---|-----------|--------|--------|
| 1 | Timer Emocional | 386-392 | Turno 1→acolha, 2→mova, 3+→mude |
| 2 | Anti-Loop | 903-907 | 3 msgs curtas → pare de perguntar |
| 3 | Protocolo de Condução | 939-954 | Ancoragem, fechamento de loop, autoridade |
| 4 | Detecção de Travamento Recorrente | 966-988 | 1ª→acolha, 2ª→cobre, 3ª→confronte |
| 5 | Modo Profundo (Fases 1-3) | 996-1031 | Presença → Sentido → Movimento |
| 6 | Cenários A/B/C/D | 1096-1180 | Presença / Direção / Emergência / Padrão |

**Conflitos identificados:** Timer diz "turno 3 mude de marcha" vs Modo Profundo diz "fique na Fase 1 por 1-2 trocas". Anti-Loop diz "3 msgs curtas = pare" sem distinguir confirmação de evasão. Cenários A-D são duplicatas exatas dos modos já definidos.

### Estrutura consolidada proposta

```text
ESTRUTURA DE ATENDIMENTO (fora de sessão):
│
├── PING-PONG (conversa leve)        ← mantém como está
│
├── MODO PROFUNDO (conteúdo emocional)
│   ├── Fase 1: Presença (1-2 trocas)
│   │   └── NOVO: detecção intra-conversa de travamento
│   │       (respostas curtas de confirmação vs evasão)
│   ├── Fase 2: Sentido (perguntas-âncora)
│   └── Fase 3: Movimento
│
├── MODO DIREÇÃO (travado, em loop)   ← Cenário B consolidado
│
└── MODO EMERGÊNCIA (crise imediata)  ← Cenário C, mantém
```

### Edições concretas no `aura-agent/index.ts`

**1. Remover Timer Emocional (linhas 386-392)**
Substituir por uma frase curta: "Não fique presa no acolhimento — após validar, mova para sentido ou ação conforme o modo ativo."

**2. Refinar Anti-Loop (linhas 903-907)**
Reescrever integrando contexto:
- Se respostas curtas são **confirmações** ("ok", "certo", "sim", "viu") → NÃO é loop, é concordância. Reformule com opções concretas ou assuma e siga.
- Se respostas curtas são **evasão** (tema emocional aberto + respostas monossilábicas sem responder à pergunta) → aí sim ofereça sua leitura.
- **NUNCA** diga "tô percebendo que você tá respondendo curtinho" para usuários em trial ou com <20 trocas.

**3. Integrar travamento intra-conversa na Fase 1 do Modo Profundo (após linha 1005)**
Adicionar ao corpo da Fase 1:
```
TRAVAMENTO INTRA-CONVERSA (detecte em tempo real):
Se o usuário deu 3+ respostas curtas seguidas que NÃO respondem suas perguntas:
- Primeiro: reformule com opções concretas ("Seria mais 6h-7h ou 8h-9h?")
- Se continuar: assuma uma resposta razoável e siga ("Vou considerar 7h — me corrige se for diferente!")
- NÃO encerre a conversa. NÃO aponte que as respostas são curtas.
- Trial/novos: respostas curtas de confirmação são NORMAIS. Continue engajando.
```

**4. Mover Detecção de Travamento Recorrente (linhas 966-988) para contexto dinâmico**
Remover do prompt estático. O contexto dinâmico já injeta `user_insights` e `commitments` — adicionar uma linha no builder de contexto que, quando detectar commitments com `status: pending` e `follow_up_count >= 2`, injete: "⚠️ [Nome] tem compromissos recorrentes não cumpridos sobre [tema]. Considere confronto afetuoso."

**5. Eliminar Cenários A/B/C/D (linhas 1096-1180)**
São duplicatas:
- Cenário A (Presença) = Modo Profundo Fase 1
- Cenário B (Direção) = Modo Direção (já detalhado em 1100-1139, manter esse bloco mas renomear)
- Cenário C (Emergência) = manter como modo separado (2 linhas)
- Cenário D (Padrão) = redundante com a seção Ping-Pong vs Profundo

Substituir por referência simples: "Classifique: Ping-Pong, Profundo, Direção ou Emergência. Siga o protocolo do modo identificado."

**6. Protocolo de Condução (linhas 939-954)**
Manter, é complementar (ancoragem no tema, fechamento de loop). Não conflita.

### Resultado esperado

- ~150 linhas removidas do prompt
- 1 árvore de decisão clara em vez de 6 frameworks concorrentes
- Travamento intra-conversa protegido na Fase 1
- Travamento inter-conversas no contexto dinâmico
- Trial users protegidos contra encerramento prematuro

### Arquivo e deploy
- `supabase/functions/aura-agent/index.ts` — edições no system prompt + builder de contexto dinâmico
- Deploy: `aura-agent`

