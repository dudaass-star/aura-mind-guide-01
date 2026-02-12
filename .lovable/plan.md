

## Diagnóstico: AURA enviando mensagens demais

### O que encontrei na conversa do Eduardo

Analisei as mensagens recentes e identifiquei os problemas:

1. **Eduardo diz "Nada. Trabalho e dps fui fazer o rancho do mês"** -- a AURA responde com 494 caracteres, metáforas elaboradas ("missão de guerra") e DUAS perguntas (tipo de comprador + passeando pelos corredores). Deveria ser 1-2 frases curtas no modo ping-pong.

2. **Eduardo diz "E depois pegar as crianças"** -- a AURA responde com 3 balões (409 chars) incluindo "portal de silêncio antes do caos" e DUAS perguntas (escola/casa + caminho/sossego). Uma informação factual de 5 palavras recebeu uma resposta elaborada demais.

3. **Eduardo diz "Assunto resolvido já"** -- a AURA responde com 535 chars, celebração exagerada + pergunta aberta. Deveria ser algo como "Boa! E o que mais tá rolando na sua vida?"

### Causa raiz

Dois problemas combinados:

**A) O prompt permite respostas longas demais em modo ping-pong.** Embora as regras digam "2-3 frases max" para ping-pong, a AURA não está seguindo isso porque:
- As instruções de "variação de balões" mencionam 3-4 balões como opção normal, o que dá margem
- Falta uma regra mais forte e repetida no prompt para modo ping-pong ser REALMENTE curto

**B) O splitting automático (threshold de 120 chars) fragmenta tudo em múltiplos balões.** Quando a AURA gera um parágrafo de 300 chars, o sistema quebra em 3 balões de ~100 chars cada, criando efeito metralhadora mesmo quando a AURA tentou mandar menos.

### Correções propostas

**1. Reforçar brevidade no prompt do sistema (aura-agent/index.ts)**

Adicionar uma regra mais enfática no bloco de ping-pong:

- Modo PING-PONG: resposta de NO MAXIMO 1-2 frases (50-80 caracteres). Exemplo: "Eita, mercado de noite é tenso! Demorou muito?" -- e nada mais.
- Reforçar: se a mensagem do usuario tem menos de 50 chars e nao tem carga emocional, a resposta da AURA tambem deve ter menos de 100 chars.
- Adicionar exemplos concretos de respostas CERTAS para situacoes do dia-a-dia do Eduardo

**2. Ajustar o splitting para nao fragmentar respostas curtas**

- Aumentar o threshold de ativacao do split de 150 para 250 chars (se a AURA mandou menos de 250 chars, NAO fragmentar)
- Manter o split por `|||` como esta (respeitando a intencao da AURA)
- Reduzir o maxChunkSize de 120 para algo mais conservador so quando necessario

**3. Reforcar a regra de UMA pergunta por vez**

- Adicionar verificacao no prompt: "Se sua resposta tem mais de 1 ponto de interrogacao, REESCREVA com apenas 1"
- Isso ataca diretamente o problema das 2 perguntas por turno

### Arquivos modificados

- `supabase/functions/aura-agent/index.ts`:
  - Prompt do sistema: reforco das regras de ping-pong com exemplos mais claros e limite de caracteres
  - Funcao `splitIntoMessages`: ajustar threshold de 150 para 250 e maxChunkSize de 120 para 160
  - Adicionar regra explicita no prompt sobre tamanho maximo em modo ping-pong

### Resultado esperado

- Respostas ping-pong com 1-2 frases curtas (tipo "Eita, mercado! Demorou?")
- Menos baloes por resposta em conversas leves
- Apenas 1 pergunta por turno, sem excecao
