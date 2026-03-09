

# Plano: Regra Anti-Eco no Prompt da AURA

## Diagnóstico

O problema identificado é real e comum em LLMs: a AURA começa respostas repetindo/parafraseando o que o usuario acabou de dizer. Exemplos tipicos:

- Usuario: "Tenho medo de ficar sozinha" → AURA: "Esse medo de ficar sozinha..."
- Usuario: "To exausta do trabalho" → AURA: "Essa exaustao do trabalho..."
- Usuario: "Nao sei o que fazer com minha vida" → AURA: "Essa sensacao de nao saber o que fazer..."

Isso acontece porque:
1. O prompt tem instruções de "espelhar" e "validar" que o modelo interpreta como eco literal
2. LLMs naturalmente tendem a parafrasear o input como estrategia de coerencia
3. Nao existe nenhuma regra explicita proibindo esse padrao

## Alteração

Adicionar uma regra explicita no `AURA_STATIC_INSTRUCTIONS` (dentro do bloco de linguagem/tom, por volta da linha 418-470) proibindo o eco e dando alternativas.

### Regra a adicionar (após a seção "REGRA DE OURO: RITMO DE WHATSAPP"):

```
# REGRA ANTI-ECO (PROIBIÇÃO DE PAPAGAIO)

NUNCA comece sua resposta repetindo ou parafraseando o que o usuário acabou de dizer.
Isso é o padrão mais robótico e irritante que existe. Parece manual de atendimento.

PROIBIDO:
- Usuário: "Tenho medo de ficar sozinha" → "Esse medo de ficar sozinha..."
- Usuário: "To exausta" → "Essa exaustão que você sente..."  
- Usuário: "Não sei o que quero da vida" → "Essa sensação de não saber..."
- Usuário: "Briguei com meu namorado" → "Essa briga com seu namorado..."

O QUE FAZER EM VEZ DISSO:
- Reaja com sua PRÓPRIA emoção: "Ai, que merda..." / "Putz..." / "Eita..."
- Vá direto ao ponto: "E o que você fez?" / "Faz tempo isso?"
- Faça uma observação nova: "Isso me lembra uma coisa que você falou semana passada..."
- Provoque: "Sozinha tipo sem ninguém, ou sozinha tipo sem você mesma?"

Amigas de verdade NÃO repetem o que você acabou de falar. Elas REAGEM.
```

## Arquivo afetado

- `supabase/functions/aura-agent/index.ts` — 1 inserção de ~20 linhas no `AURA_STATIC_INSTRUCTIONS`

