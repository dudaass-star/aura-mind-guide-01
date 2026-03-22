

# Plano: Separação de Preocupações — Agentic Workflow para o aura-agent

## Objetivo
Remover tags de controle do prompt da AURA e mover a lógica para o backend (TypeScript/Deno), permitindo que o modelo Flash foque exclusivamente em conversação terapêutica de qualidade.

## Contexto Atual
O `aura-agent/index.ts` tem **5690 linhas** com um prompt estático (`AURA_STATIC_INSTRUCTIONS`) de ~1600 linhas que instrui o modelo a gerar **~25 tipos de tags** diferentes (agendamento, temas, compromissos, meditação, DND, jornadas, sessões, etc.). O backend já processa essas tags após a resposta, mas o modelo precisa "lembrar" de gerá-las corretamente — uma carga cognitiva enorme para modelos menores.

## Arquitetura Proposta

```text
┌──────────────────────────────────────────────────────────┐
│                    ANTES (atual)                         │
│  Prompt → LLM gera texto + 25 tags → Backend processa   │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                    DEPOIS (novo)                          │
│  Prompt limpo → LLM gera APENAS texto natural            │
│       ↓                                                   │
│  Micro-agente extrator (Flash-Lite, pós-resposta)        │
│  → Analisa texto e gera JSON de ações                    │
│       ↓                                                   │
│  Backend executa ações (DB, WhatsApp, agendamentos)      │
└──────────────────────────────────────────────────────────┘
```

## Fases de Implementação

### Fase 1: Micro-agente Extrator de Ações (Prioridade Alta)

Criar uma função `extractActionsFromResponse()` que roda **após** a resposta do LLM principal, usando `google/gemini-2.5-flash-lite` (baratíssimo) com tool calling para extrair ações estruturadas.

**Tags removidas do prompt principal:**
- `[AGENDAR_TAREFA:...]` → Extrator detecta intenção de lembrete
- `[CANCELAR_TAREFA:...]` → Extrator detecta cancelamento
- `[MEDITACAO:categoria]` → Extrator detecta necessidade emocional e mapeia para categoria
- `[NAO_PERTURBE:Xh]` → Backend detecta despedida + hora e calcula silêncio
- `[CAPSULA_DO_TEMPO]` → Extrator detecta aceitação de cápsula
- `[COMPROMISSO_LIVRE:...]` → Extrator detecta compromissos
- `[AGENDAR_SESSAO:...]` / `[REAGENDAR_SESSAO:...]` → Extrator detecta intenção de agendamento
- `[CRIAR_AGENDA:...]` → Extrator detecta confirmação de agenda
- `[PAUSAR_SESSOES:...]` → Extrator detecta pausa

**Implementação:**
- Usar tool calling do Gemini Flash-Lite com schema JSON pré-definido
- Uma única chamada pós-resposta com a mensagem do usuário + resposta da AURA
- Custo estimado: ~0.001 USD por chamada (Flash-Lite, <200 tokens output)

### Fase 2: Controle de Fluxo Determinístico (Prioridade Alta)

Mover para o backend (sem LLM):

- **`[AGUARDANDO_RESPOSTA]` / `[CONVERSA_CONCLUIDA]`**: O backend já tem fallback (linha ~7218 do sistema). Expandir com heurísticas:
  - Resposta termina com `?` → awaiting
  - Detecção de despedida via regex (`boa noite`, `até amanhã`, `tchau`) → completed
  - Horário BRT 22h-8h + despedida → completed + DND automático
  
- **`[MODO_AUDIO]`**: O prompt instrui quando usar áudio, mas a decisão pode ser movida para o backend:
  - Sessão ativa + primeiras 2 respostas → forçar áudio (já existe parcialmente)
  - Crise detectada (já existe `isCrisis()`) → forçar áudio
  - Usuário pediu áudio (já existe `userWantsAudio()`) → forçar áudio
  - Manter apenas uma instrução simples no prompt: "Se for usar áudio, escreva como se estivesse falando"

### Fase 3: Extração Assíncrona de Temas e Insights (Prioridade Média)

**Tags removidas:**
- `[TEMA_NOVO:...]`, `[TEMA_PROGREDINDO:...]`, `[TEMA_RESOLVIDO:...]`, `[TEMA_ESTAGNADO:...]`
- `[INSIGHTS]...[/INSIGHTS]`
- `[INSIGHT:...]` (tags de sessão)

**Implementação:**
- Criar edge function `post-conversation-analysis` que roda assincronamente
- Ativada por `EdgeRuntime.waitUntil()` após envio da resposta
- Usa Flash-Lite com tool calling para extrair: temas discutidos, progressos, insights sobre o usuário
- Resultado salvo em `session_themes`, `user_insights`, `commitments`
- **Não bloqueia** a resposta ao usuário

### Fase 4: Simplificação do Prompt (Prioridade Alta — executar junto com Fases 1-3)

Reescrever `AURA_STATIC_INSTRUCTIONS` removendo:
- Todas as seções de documentação de tags (~400 linhas)
- Regras de formatação de tags (ISO dates, formatos específicos)
- Seção de "Meditações Guiadas" (catálogo vai para extrator)
- Seção de "Agendamento de Tarefas" (lógica vai para extrator)
- Seção de "Controle de Fluxo" (AGUARDANDO/CONCLUIDA movido para backend)
- Seção de "Jornadas de Conteúdo" (tags movidas para extrator)
- Seção de "Detecção de Indisponibilidade" (DND movido para backend)
- Seção de "Agendamento de Sessões" (movido para extrator)
- Seção de "Pausar Sessões" (movido para extrator)
- Seção de "Compromissos em Conversas Livres" (movido para extrator)
- Seção de "Uso de Tags de Tema" (movido para análise assíncrona)
- Seção de "Detecção de Tema Resolvido" (movido para análise assíncrona)

**O que permanece no prompt:**
- Persona e identidade da AURA (~100 linhas)
- Protocolo de segurança/crise (~80 linhas)
- Linguagem e tom de voz (~50 linhas)
- Regra de ouro do WhatsApp (~30 linhas)
- DNA da AURA — estilo e profundidade (~80 linhas)
- Método terapêutico (Presença → Sentido → Movimento) (~60 linhas)
- Estrutura de atendimento (Ping-Pong, Profundo, Direção) (~40 linhas)
- Anti-eco, anti-papagaio (~20 linhas)
- Estrutura de sessão (fases) (~150 linhas — essencial para sessões)
- Instrução simplificada: "Converse naturalmente. O sistema detecta automaticamente agendamentos, temas e compromissos."

**Estimativa de redução:** de ~1600 linhas para ~700 linhas (~56% de redução)

### Fase 5: Outras Melhorias Identificadas

1. **Deduplicação de código**: `stripAllInternalTags()` e `sanitizeMessageHistory()` fazem regex quase idênticos em ~60 linhas cada. Unificar.

2. **Remoção de lógica morta**: Código Anthropic (linhas 270-331) parece não estar em uso ativo. Avaliar remoção.

3. **Anti-echo simplificado**: Com o prompt menor e mais focado, o Flash deve ecoar menos. Monitorar se os guards anti-eco (linhas 4210-4388) ainda são necessários após a migração.

4. **Context caching otimizado**: Com prompt 56% menor, o cache será mais barato e o hash mais estável (menos mudanças = mais cache hits).

5. **Extração de sessão**: A extração de resumo/insights no encerramento de sessão (linhas 4990-5055) já usa Flash separado. Pode ser absorvida pelo micro-agente pós-resposta.

## Detalhes Técnicos

### Schema do Micro-agente Extrator (tool calling)

```typescript
const extractionTools = [{
  type: "function",
  function: {
    name: "extract_actions",
    parameters: {
      type: "object",
      properties: {
        schedule_reminder: {
          type: "object",
          properties: {
            description: { type: "string" },
            relative_time: { type: "string" }, // "amanhã às 9h", "daqui 10 min"
          }
        },
        schedule_meditation: {
          type: "object",
          properties: {
            emotional_need: { type: "string" } // "insônia", "ansiedade"
          }
        },
        conversation_status: {
          type: "string",
          enum: ["awaiting", "completed", "neutral"]
        },
        do_not_disturb_hours: { type: "number" },
        commitments: {
          type: "array",
          items: { type: "string" }
        },
        session_action: {
          type: "string",
          enum: ["schedule", "reschedule", "pause", "create_monthly"]
        },
        // ... outros campos
      }
    }
  }
}];
```

### Custo Estimado do Micro-agente
- Input: ~500 tokens (mensagem do usuário + resposta da AURA)
- Output: ~100 tokens (JSON estruturado)
- Modelo: `google/gemini-2.5-flash-lite`
- Custo: ~$0.0001 por chamada (insignificante)
- Latência: ~200ms (paralelo ao envio da mensagem)

## Ordem de Execução Recomendada

1. **Fase 1 + Fase 4** juntas (micro-agente + limpeza do prompt) — maior impacto
2. **Fase 2** (controle de fluxo determinístico) — elimina mais instruções
3. **Fase 3** (análise assíncrona) — remove últimas tags
4. **Fase 5** (cleanup geral)
5. **Teste A/B**: Rodar Flash com prompt novo vs Pro com prompt atual em 10 conversas reais

## Riscos e Mitigações

| Risco | Mitigação |
|---|---|
| Flash-Lite extrai ações incorretamente | Tool calling com schema rígido + validação no backend |
| Flash principal perde qualidade terapêutica | Prompt mais focado deve MELHORAR, não piorar |
| Latência adicional do micro-agente | Rodar em paralelo com envio ao WhatsApp via `waitUntil` |
| Perda de agendamentos se extrator falhar | Manter fallback regex no backend (já existe para meditação) |

