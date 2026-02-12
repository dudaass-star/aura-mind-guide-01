

## Ajuste: Variação natural de ritmo nas respostas da AURA

### Problema atual

A "Regra Suprema de Brevidade" (linhas 284-304) força respostas curtas demais (maximo 100 chars) para qualquer mensagem factual. Isso torna a AURA previsivel e robotica -- sempre respondendo com 1 frase seca. Uma pessoa real no WhatsApp varia: as vezes manda 1 balao rapido, as vezes 2 ou 3, as vezes elabora mais. E essa variacao que da vida a conversa.

### O que mudar

**Arquivo:** `supabase/functions/aura-agent/index.ts`

**1. Substituir a "Regra Suprema de Brevidade" por uma "Regra de Variacao Natural"**

Remover o bloco rigido de "maximo 100 chars" (linhas 284-304) e substituir por instrucoes que incentivem variacao:

```text
# RITMO NATURAL DE CONVERSA (FORA DE SESSAO)

Varie o tamanho das suas respostas como uma pessoa real faria no WhatsApp:

- 1 baloo (30%): Reacoes rapidas, validacoes. "Boa!", "Eita, serio?", "Haha que bom!"
- 2 baloes (40%): O padrao -- uma reacao + uma pergunta ou comentario
- 3 baloes (20%): Quando tem algo a desenvolver -- reacao + contexto + pergunta
- 4 baloes (10%): Momentos mais ricos -- historia, reflexao, conexao com algo anterior

A CHAVE e variar. Nao fique preso em 1 tamanho so.
Cada baloo deve ter 1-3 frases curtas (maximo ~160 chars por baloo).
MAXIMO 1 pergunta por turno (em qualquer quantidade de baloes).
```

**2. Manter as regras de qualidade que ja funcionam**

- Manter a regra de "maximo 1 pergunta por turno" (essa e boa)
- Manter a regra de "espelhar energia do usuario" (linha 280)
- Manter os exemplos de respostas ERRADAS (metaforas elaboradas, 2 perguntas) como referencia do que NAO fazer
- Manter a secao de "NATURALIDADE NA CONVERSA" (linhas 306-313)

**3. Nao mexer no splitting**

O `splitIntoMessages` (threshold 250, maxChunkSize 160) esta adequado. O problema nao e o codigo de splitting -- e o prompt que forçava brevidade extrema. Com o prompt corrigido, a AURA vai usar `|||` naturalmente para 2-4 baloes, e o splitting so vai atuar como safety net para textos muito longos.

### Secao tecnica

Mudancas especificas no arquivo `supabase/functions/aura-agent/index.ts`:

- **Linhas 284-304**: Remover bloco "REGRA SUPREMA DE BREVIDADE" inteiro
- **No mesmo local**: Inserir bloco "RITMO NATURAL DE CONVERSA" com as porcentagens de variacao e exemplos para cada quantidade de baloes
- **Linhas 315-323**: Ajustar "FORMATACAO DE WHATSAPP" para ser consistente com a nova regra (remover redundancias)
- **Manter** linhas 306-313 (NATURALIDADE NA CONVERSA) como esta

### Resultado esperado

- AURA alterna entre 1, 2, 3 e 4 baloes de forma organica
- As vezes responde "Boa!" (1 baloo), as vezes desenvolve mais (3 baloes)
- Continua com maximo 1 pergunta por turno
- Parece mais uma pessoa real conversando no WhatsApp
