

# Lógica de Extração de Dados — Diagnóstico Completo

## Como funciona hoje

A extração de dados no encerramento tem **3 camadas**, em cascata:

### Camada 1: Tags determinísticas (prioridade máxima)
A Aura é instruída a incluir tags invisíveis na resposta final:
- `[INSIGHT:texto do insight]` — capturado por regex (linha 4328)
- `[COMPROMISSO:texto]` — capturado por regex (linha 4329)
- `[ENCERRAR_SESSAO]` — sinaliza que a IA quer encerrar

Tags são extraídas e removidas da mensagem antes de enviar ao usuário (linha 4342).

### Camada 2: Extração por IA (fallback principal)
Se as tags não foram encontradas (ou vieram vazias), o sistema chama Gemini Flash com as últimas 15 mensagens e pede um JSON:
```json
{
  "summary": "resumo em 2-3 frases",
  "insights": ["insight 1", "insight 2"],
  "commitments": ["compromisso 1"]
}
```
Tags extraídas na Camada 1 têm **prioridade** — o Flash só preenche o que está vazio (linhas 4395-4402).

### Camada 3: Regex manual (último recurso)
Se o JSON do Flash falhar no parse, duas funções fazem busca por padrões:
- `extractKeyInsightsFromConversation()` — procura "percebi que", "entendi que", "aprendi que" etc.
- `extractCommitmentsFromConversation()` — procura "vou", "prometo", "me comprometo a" etc.

## O que falhou na sessão da Clara

A sessão tinha 8h desde o início. O código na **linha 2747** é:
```typescript
if (wantsToEndSession(message) || timeInfo.isOvertime) {
  shouldEndSession = true;
}
```

`timeInfo.isOvertime` era `true` (>45 min desde `started_at`), então `shouldEndSession = true` foi forçado **sem a Clara pedir**.

Na hora da extração (linha 4349), o bloco rodou, mas:
1. A Aura não incluiu tags `[INSIGHT:]` nem `[COMPROMISSO:]` porque **não sabia que era para encerrar** — o encerramento foi decidido pelo backend, não pela IA
2. O Gemini Flash recebeu as últimas 15 mensagens, mas após 8h de gap, a conversa estava fragmentada — gerou um resumo genérico
3. Resultado: `session_summary: "Sessão concluída"`, `key_insights: []`, `commitments: []`

## Sobre a pausa

A lógica de pausa (linha 4651) tem esta condição:
```typescript
if (shouldPauseSession && !shouldEndSession && !aiWantsToEndSession)
```

Como `shouldEndSession` já era `true` por causa do overtime, a pausa **nunca roda** nesse cenário. O overtime sempre ganha.

## O que o plano aprovado corrige

1. **Remove `timeInfo.isOvertime`** como trigger de `shouldEndSession` — overtime vira apenas instrução para a Aura propor encerramento, não forçar
2. **Gaps >2h** são tratados como retomada (nova fase `resuming`) com relógio resetado para ~20 min
3. Com isso, quando Clara voltou às 06:55, a sessão seria retomada normalmente em vez de auto-encerrada
4. A extração de dados só roda quando o **usuário** decide encerrar ou a **Aura** inclui `[ENCERRAR_SESSAO]` — garantindo que as tags estejam presentes na resposta de fechamento

