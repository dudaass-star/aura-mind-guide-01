

# Simulador Automatizado de Testes da Aura

## Visao geral

Criar uma edge function `run-system-tests` que executa uma bateria completa de simulacoes automaticas, e uma pagina `/admin/testes` que mostra os resultados com veredicto final (tudo OK ou sugestoes de melhoria).

## Arquitetura

### 1. Edge Function: `run-system-tests/index.ts`

Funcao orquestradora que roda todos os testes sequencialmente usando service role key. Cada teste retorna `pass/fail` com detalhes e sugestoes.

**Testes implementados:**

| Teste | O que simula | Validacoes |
|-------|-------------|------------|
| Conversa casual | 5 mensagens variadas ao `aura-agent` | Respostas nao vazias, tamanho adequado (<500 chars), sem tags de sessao |
| Conversa emocional | Mensagens de desabafo/crise | Acolhimento presente, sem disclaimers proibidos, protocolo de seguranca |
| Sessao completa (45min) | 15-20 mensagens com timestamps manipulados | Fases corretas (abertura→exploracao→reframe→encerramento), tags de controle nos momentos certos, summary/insights/commitments gerados |
| Follow-up | Invoca `conversation-followup` com dry_run | Detecta usuarios elegiveis, mensagens nao genericas |
| Relatorio semanal | Invoca `weekly-report` com dry_run | Contem metricas, analise de evolucao, formato correto |
| Check-in | Invoca `scheduled-checkin` com dry_run | Mensagem gerada corretamente, saudacao adequada |
| Reengajamento | Verifica logica de reengajamento | Detecta inativos, mensagem contextual |

**Fluxo da simulacao de sessao:**
- Cria sessao de teste com `started_at` manipulado
- Envia mensagens pre-definidas ao `aura-agent` sequencialmente
- Entre grupos de mensagens, atualiza `started_at` da sessao para simular passagem de tempo (0→5→15→25→35→42 min)
- Valida automaticamente cada resposta
- Limpa dados de teste ao final

**Pos-teste: Analise e sugestoes**
- Apos todos os testes, usa IA (Gemini) para analisar os resultados consolidados
- Gera veredicto: "Tudo OK" ou lista de sugestoes de melhoria especificas
- Avalia qualidade das respostas (tom, tamanho, relevancia)
- Identifica padroes problematicos (respostas genericas, tags erradas, etc)

### 2. Modificacoes nas Edge Functions (dry_run)

Adicionar suporte a `dry_run: true` no body de:
- **`weekly-report`**: Gera relatorios mas retorna sem enviar via Z-API
- **`scheduled-checkin`**: Gera mensagens mas retorna sem enviar
- **`conversation-followup`**: Executa logica mas retorna sem enviar

Quando `dry_run=true`, as funcoes pulam `sendTextMessage` e retornam o conteudo gerado no JSON de resposta.

O `aura-agent` ja retorna mensagens no response sem enviar WhatsApp (quem envia e o `webhook-zapi`), entao nao precisa de dry_run.

### 3. Frontend: `src/pages/AdminTests.tsx`

- Protegido por `useAdminAuth`
- Botao "Executar Todos os Testes" que invoca `run-system-tests`
- Cards para cada teste com: status (pass/fail/running), tempo de execucao, detalhes expandiveis
- Barra de progresso geral
- Secao de "Veredicto Final" com analise da IA: tudo OK ou sugestoes de melhoria
- Log detalhado da simulacao de sessao (mensagem enviada → resposta recebida → validacao)

### 4. Rota e Config

- Adicionar `/admin/testes` no `App.tsx`
- Registrar `run-system-tests` no `config.toml` com `verify_jwt = false`

## Detalhes tecnicos

- Usuario de teste: usa o admin logado (user_id do admin)
- Mensagens de teste sao marcadas e deletadas ao final
- Sessoes de teste sao deletadas ao final
- Timeout: pode levar 60-120s (muitas chamadas ao LLM para sessao completa)
- A funcao retorna resultados parciais via streaming ou resultado completo ao final

## Escopo de implementacao

1. Adicionar `dry_run` a `weekly-report`, `scheduled-checkin`, `conversation-followup`
2. Criar `supabase/functions/run-system-tests/index.ts`
3. Criar `src/pages/AdminTests.tsx`
4. Registrar rota em `App.tsx` e funcao em `config.toml`

