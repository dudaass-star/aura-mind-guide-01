

## Plano: Memória Terapêutica da Aura

Sua análise final está sólida. Concordo com cada item da tabela. Vou ser direto sobre o que penso de cada decisão e depois montar a implementação.

### Minha opinião sincera

**`fase` — omitir do banco, OK.** Você acertou ao reconhecer que a heurística vai errar em conversas híbridas. E a pergunta que você fez — "vale a complexidade para um benefício já parcialmente coberto pelo histórico?" — a resposta honesta é: não para v1. O modelo já lê as últimas mensagens. Se ele viu que a última troca foi acolhimento puro, ele sabe que está na Fase 1. Não precisa de um campo no banco dizendo isso. Se no futuro a gente perceber que ele não está usando bem essa informação implícita, aí sim vale codificar.

**`tecnica` — o único dado novo real.** Concordo 100%. É acumulativo (reframe_sofrimento usado em março não "expira" em abril), estável, e resolve um problema concreto: evitar repetir a mesma técnica. Encaixa perfeitamente no formato de insights.

**`[COMPROMISSO_LIVRE]` — elegante.** O parser de compromissos já existe (linhas 4625-4696). Adicionar uma tag nova que insere na mesma tabela `commitments` são ~15 linhas de código. Sem `session_id` (porque não tem sessão), o resto igual.

**`session_themes` em conversas livres — já funciona.** O parser de `[TEMA_NOVO]` etc. (linhas 4554-4623) não checa se está em sessão. Qualquer conversa pode gerar temas. O gap é que o prompt talvez não instrua a Aura a usar essas tags fora de sessão. Isso é ajuste de prompt, não de código.

### O que muda

Arquivo: `supabase/functions/aura-agent/index.ts`

**1. Prompt — Nova categoria `tecnica` na tabela de insights (~linha 1290)**

Adicionar entre PRIORIDADE ALTA e PRIORIDADE MÉDIA:

```
### PRIORIDADE ALTA — Processo Terapêutico

| Categoria | Quando salvar | Exemplos |
|---|---|---|
| tecnica | Técnica de Logoterapia usada com o usuário nesta conversa | reframe_sofrimento, responsabilidade_radical, projecao_futuro |

REGRA: Salve APENAS quando efetivamente usou a técnica, não quando mencionou de passagem.
Exemplo: [INSIGHTS]tecnica:usada:reframe_sofrimento[/INSIGHTS]
```

**2. Prompt — Tag `[COMPROMISSO_LIVRE:texto]` (~linha 1340, junto com as regras de controle de fluxo)**

Adicionar instrução para a Aura usar `[COMPROMISSO_LIVRE:descrição]` quando o usuário se comprometer com algo fora de sessão formal.

**3. Prompt — Instruir uso de tags de tema fora de sessão**

Reforçar que `[TEMA_NOVO]`, `[TEMA_PROGREDINDO]` etc. devem ser usadas também em conversas livres profundas, não só em sessões.

**4. Código — Parser da tag `[COMPROMISSO_LIVRE]` (~linha 4696)**

Após o bloco de compromissos existente, adicionar parser:
- Regex: `[COMPROMISSO_LIVRE:texto]`
- Inserir na tabela `commitments` com `session_id: null`, `commitment_status: 'pending'`
- Limpar tag da resposta

**5. Código — Injetar técnicas no contexto dinâmico (~linha 3637)**

Após `formatInsightsForContext(userInsights)`, adicionar bloco:
- Filtrar insights com `category === 'tecnica'`
- Se houver, adicionar ao contexto: `## Processo Terapêutico\n- Técnicas já usadas: [lista]`

### O que NÃO fazer
- Nenhuma migração de banco (user_insights já suporta qualquer category como text)
- Nenhuma detecção de fase por heurística (v1 — o modelo lê o histórico)
- Nenhuma categoria nova de insight_chave (session_themes cobre)

### Deploy
Redeploy `aura-agent`

