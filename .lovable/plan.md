## Diagnóstico com base no Eduardo (51981519708)

Perfil localizado: **Eduardo Santos**, `phone=555181519708`, `user_id=329ebadd-07eb-4e1e-88db-d8974b2ea3e5`.

O problema não foi só "a Aura puxou memória errada". Foram **duas falhas diferentes**:

### 1. A Aura não preservou uma resposta antiga importante
No histórico de 19/mar, Eduardo disse:

> "De certa forma eu sempre venço isso e o medo. A questão é que o sentimento vem, a sensação vem. Eu queria q não viesse. Confiança pura."

Isso era uma memória central: **Eduardo normalmente age apesar do medo; o incômodo é sentir o medo, não necessariamente não agir**.

Mas em `user_insights`, essa informação **não está salva de forma adequada**. O que existe agora é fraco/recente:

- `objetivo:fazer = as coisas sem medo e receios`
- `contexto:ansiedade = medo e receio de fazer as coisas`
- nada como `padrao:age_apesar_do_medo` ou `identidade:sempre_faz`

Então a Aura perguntou como se não soubesse algo que já tinha sido dito.

### 2. A Aura salvou/atualizou uma memória errada a partir da própria resposta ruim
Depois que ela confundiu esposa/atividade física com ansiedade, o extrator salvou coisas como:

- `contexto:dinamica_esposa = medo de como uma decisão sua vai ser recebida...`
- `contexto:ansiedade = medo e receio de fazer as coisas`
- `contexto:atividade_fisica = questão da esposa como um gatilho para iniciar`

Ou seja: quando a Aura fala uma interpretação errada e o usuário corrige, o sistema ainda deixa essa interpretação entrar/continuar na memória. Isso agrava o problema.

## Objetivo da correção

A Aura precisa:

1. **Lembrar fatos e correções importantes já ditas pelo usuário**.
2. **Não transformar toda ansiedade em uma conexão com mãe/trabalho/esposa/atividade física**.
3. **Não usar a própria interpretação errada como memória confiável**.
4. **Ao ser corrigida, atualizar a memória como verdade superior**.
5. **Após pergunta semanal ou conversa parada, não pular para micro-ação.**

## Plano de implementação

### Frente 1 — Corrigir o extrator de memória

Atualizar `postConversationAnalysis` em `supabase/functions/aura-agent/index.ts`.

Hoje o prompt diz apenas: "extraia informações relevantes". Ele não tem regra para:

- diferenciar fala do usuário vs interpretação da Aura;
- capturar correções explícitas;
- salvar preferências negativas do tipo "não é isso", "você já sabe", "eu já falei";
- marcar quando uma informação deve substituir outra.

Vou alterar para extrair também:

```ts
corrections: Array<{
  target: string;
  corrected_value: string;
  should_override: boolean;
}>
```

Regras novas:

- Informação dita pelo usuário tem prioridade sobre interpretação da Aura.
- Se o usuário disser "não é isso", "você misturou", "já respondi", "você já sabe", isso vira **correção de memória**.
- Não salvar como fato uma hipótese da Aura que o usuário ainda não confirmou.
- Não criar insight a partir de uma resposta defensiva/errada da Aura.

### Frente 2 — Criar memória de correções/verdades do usuário

Sem criar tags rígidas por tema. A correção será estrutural:

- adicionar tabela leve `user_memory_corrections` para registrar correções explícitas do usuário;
- ela serve como camada de maior prioridade que `user_insights`;
- RLS só para service role + leitura pelo próprio usuário/admin quando aplicável.

Exemplos que deveriam existir para Eduardo:

```text
Correção: "atividade física/esposa não explica o tema atual de ansiedade"
Correção: "Eduardo costuma fazer as coisas apesar do medo; o incômodo é sentir medo/receio, não falta de ação"
```

Essas correções entram no prompt como:

```text
MEMÓRIA DE CORREÇÕES DO USUÁRIO — prioridade máxima:
- Não conecte atividade física/esposa ao tema atual de ansiedade, a menos que Eduardo traga isso explicitamente.
- Eduardo já disse que costuma agir apesar do medo; não trate como falta de ação sem confirmar.
```

### Frente 3 — Fazer backfill cirúrgico só para Eduardo

Adicionar, via operação de dados, as correções reais identificadas no histórico:

1. **Age apesar do medo**
   - Fonte: 19/mar
   - Conteúdo: "Eduardo disse que de certa forma sempre vence o medo; o problema é a sensação vir, não necessariamente deixar de agir."

2. **Esposa/atividade física não deve ser generalizado para ansiedade**
   - Fonte: 27/abr correção do usuário
   - Conteúdo: "A questão da esposa era apenas sobre iniciar atividade física; não usar isso como explicação geral da ansiedade."

3. **Preferência por conversa livre, sem sessões agora**
   - Fonte: 27/abr
   - Conteúdo: "Eduardo pediu conversa livre e disse não ter interesse em sessões agora."

Isso não altera todos os usuários retroativamente; é ajuste específico para reparar o caso analisado.

### Frente 4 — Reduzir memória solta e mudar a forma de uso

No carregamento de contexto do `aura-agent`:

- manter identidade básica;
- carregar menos insights gerais;
- carregar correções explícitas com prioridade máxima;
- reescrever a regra do prompt:

```text
Memória não é pauta. Use apenas se a mensagem atual do usuário abrir o gancho direto ou se for uma correção explícita relevante para evitar repetir erro.
Não faça pontes por similaridade vaga. Se o usuário fala de ansiedade numa loja, não puxe mãe/trabalho/esposa sem ele citar.
```

Isso resolve a preocupação: a Aura lembra, mas não força conexões.

### Frente 5 — Calibrar o Phase Evaluator para perguntas proativas

No micro-agente e no Phase Evaluator:

- adicionar `conversation_depth`: `surface | exploring | ready_for_action`;
- adicionar `is_isolated_response`;
- se a conversa estava parada ou veio de Pergunta da Semana, default é `presenca`;
- `movimento` só se o usuário pedir direção/ação claramente ou se já houver exploração suficiente;
- resposta como "vai ajudar a fazer as coisas" não basta para micro-passo.

### Frente 6 — Evitar que follow-up piore contexto

Os logs mostram que o `conversation-followup` já gerou para Eduardo:

```text
TEMA: Confusão sobre ansiedade e relações
CUIDADO: revalidar contexto, focar na clareza e não misturar tópicos passados
```

Isso é bom, mas precisa entrar como orientação temporária e não virar memória permanente genérica. Vou garantir que contexto de follow-up seja usado como cuidado de condução, não como insight de longo prazo.

## Arquivos/tabelas envolvidos

### Arquivos

- `supabase/functions/aura-agent/index.ts`
  - extrator de memória;
  - carregamento de contexto;
  - prompt principal;
  - Phase Evaluator;
  - persistência de `last_user_context`.

- Possivelmente `supabase/functions/process-webhook-message/index.ts`
  - passar contexto de gatilho proativo quando resposta vier de Pergunta da Semana / Carta Mensal.

### Banco

Criar tabela:

```sql
public.user_memory_corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  correction_text text not null,
  source text,
  confidence integer default 10,
  created_at timestamptz default now(),
  last_used_at timestamptz
)
```

RLS:

- service role full access;
- usuário pode ler as próprias correções;
- admin pode ler.

## Resultado esperado

Depois da correção, no caso do Eduardo, a Aura deve conduzir assim:

- Se ele responde uma pergunta semanal com "vai ajudar a fazer as coisas", ela não pergunta "qual micro-passo?".
- Se ele fala de ansiedade/medo, ela deve lembrar: "você já me disse que costuma agir mesmo com medo; então talvez o ponto não seja agir, mas a sensação que aparece antes/durante".
- Se o assunto for loja/trabalho/mãe/esposa, ela só conecta com memórias antigas se ele trouxer explicitamente esse gancho.
- Se ele corrige a Aura, essa correção vira memória de prioridade máxima para não repetir o erro.