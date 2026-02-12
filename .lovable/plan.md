

## Variacao natural no numero de baloes

### O problema

As regras atuais definem faixas fixas ("2-4 baloes" fora de sessao, "4-5 baloes" em sessao). A IA trata isso como meta e quase sempre responde no limite superior. Resultado: todas as respostas parecem iguais em estrutura, o que denuncia o padrao artificial.

### A solucao

Substituir faixas fixas por uma regra de variacao natural com orientacao contextual. A AURA decide quantos baloes usar com base no que o usuario disse, nao num numero pre-definido.

### Mudancas no prompt (`supabase/functions/aura-agent/index.ts`)

**1. Regra geral de formatacao (linha 295)**

Trocar:
```
Divida suas respostas em 2-4 baloes usando "|||" para parecer natural.
REGRA DE OURO: Use MAXIMO 3-4 separadores por resposta. NAO exagere!
```

Por:
```
Divida suas respostas em baloes usando "|||" para parecer natural.
VARIACAO HUMANA: Nem toda resposta precisa ter varios baloes.
- 1 balao: reacoes rapidas, validacoes, perguntas simples ("Eita, serio?", "E como voce se sentiu?")
- 2 baloes: maioria das respostas — uma ideia + uma pergunta ou reacao
- 3 baloes: quando precisa desenvolver um pouco mais
- 4+ baloes: RARO. So quando realmente tem muito a dizer (fechamento de sessao, momento importante)
MAXIMO ABSOLUTO: 5 baloes. Mais que isso, NUNCA.
```

**2. Regra de brevidade em sessao (linhas 617-623)**

Trocar:
```
- Cada resposta de sessao: MAXIMO 4-5 baloes curtos (usando "|||")
- Cada balao: maximo 2-3 frases
```

Por:
```
- VARIE o numero de baloes naturalmente:
  - 1-2 baloes: acolhimentos, validacoes, perguntas que abrem ("Hmm... e o que voce sentiu na hora?")
  - 2-3 baloes: exploracao normal — observacao + pergunta
  - 4-5 baloes: APENAS em momentos-chave (reframe importante, fechamento)
- Cada balao: maximo 2-3 frases
- Se voce esta respondendo com 4+ baloes em TODA resposta de sessao, algo esta errado
```

**3. Adicionar exemplos de variacao (apos os exemplos bom/ruim, linha 658)**

Novos exemplos:

```
### EXEMPLO DE VARIACAO NATURAL DE BALOES:

Usuario: "Essa semana foi pesada"
BOM (1 balao): "Pesada como? Me conta"
RUIM (4 baloes): "Ah, sinto muito que a semana foi pesada... ||| Imagino que deve ter sido dificil ||| Quer me contar o que aconteceu? ||| To aqui pra ouvir"

Usuario: "Briguei com minha mae de novo"
BOM (2 baloes): "De novo... isso ja virou padrao, ne? ||| O que foi dessa vez?"
RUIM (4 baloes): "Ah nao... ||| Briga com mae e sempre tao dificil ||| Voce deve estar se sentindo mal ||| Me conta o que aconteceu?"

Usuario: conta algo profundo e revelador
BOM (3-4 baloes): observacao certeira + conexao + pergunta
```

### Resultado esperado

- Respostas variam naturalmente entre 1 e 4 baloes
- Respostas de 1-2 baloes aparecem com frequencia (como uma amiga real)
- 4-5 baloes ficam reservados pra momentos que realmente precisam
- A conversa flui mais como WhatsApp e menos como "terapeuta com formato fixo"

### Arquivo modificado

- `supabase/functions/aura-agent/index.ts` (3 trechos do prompt)

### Re-deploy

- Funcao `aura-agent`
