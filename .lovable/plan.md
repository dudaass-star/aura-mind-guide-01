

## Corrigir: AURA deve enviar meditacoes pre-gravadas em vez de criar audio na hora

### Problema

Existem 6 meditacoes pre-gravadas com audio pronto no banco:
- `sono` - Relaxamento para Dormir
- `ansiedade` - Acalmando a Tempestade
- `estresse` - Relaxamento Muscular Progressivo
- `foco` - Clareza Mental
- `respiracao` - Respiracao 4-7-8
- `gratidao` - Olhar de Gratidao

Porem, quando o Rodrigo pediu uma meditacao para dormir, a AURA gerou um audio TTS na hora em vez de enviar o audio pre-gravado. Isso acontece porque **nao existe nenhuma integracao** entre o fluxo de resposta da AURA e a funcao `send-meditation`.

Especificamente:
1. O prompt da AURA nao instrui o LLM a usar tags como `[MEDITACAO:sono]`
2. O codigo do `aura-agent` nao detecta essas tags na resposta
3. O `webhook-zapi` nao chama `send-meditation` em nenhum momento

### Solucao em 2 partes

**Parte 1 - Prompt (aura-agent/index.ts)**

Adicionar instrucao no prompt do sistema para que, quando o usuario pedir ou a situacao indicar uma meditacao, a AURA use a tag `[MEDITACAO:categoria]` na resposta. Categorias validas: `sono`, `ansiedade`, `estresse`, `foco`, `respiracao`, `gratidao`.

Exemplo de uso:
- Usuario: "Nao consigo dormir" -> AURA: "Vou te mandar uma meditacao pra relaxar [MEDITACAO:sono]"
- Usuario: "Estou muito ansioso" -> AURA: "Tenho uma meditacao que pode te ajudar agora [MEDITACAO:ansiedade]"

A AURA NAO deve gerar audio TTS quando for enviar meditacao -- a tag substitui isso.

**Parte 2 - Codigo (aura-agent/index.ts)**

Apos receber a resposta do LLM e antes de montar os message chunks, detectar a tag `[MEDITACAO:categoria]` na resposta:

1. Extrair a categoria da tag com regex
2. Remover a tag do texto da resposta (o usuario nao deve ve-la)
3. Chamar a funcao `send-meditation` passando a categoria e o telefone/user_id do usuario
4. A funcao `send-meditation` ja cuida de: buscar meditacao da categoria, evitar repeticao, enviar mensagem de introducao e enviar o audio

### Detalhes tecnicos

**Arquivo:** `supabase/functions/aura-agent/index.ts`

**Mudanca 1 - Adicionar instrucao de meditacao no prompt do sistema:**

Na secao de regras (proximo a regras de audio), adicionar bloco explicando as categorias disponiveis e quando usar a tag. Incluir regra de que ao usar `[MEDITACAO:...]`, a AURA NAO deve usar `[MODO_AUDIO]` nem tentar descrever a meditacao inteira -- apenas uma frase curta de introducao.

**Mudanca 2 - Detectar tag e chamar send-meditation:**

Apos a linha onde `assistantMessage` e obtida (resposta do LLM), antes do `splitIntoMessages`:

```text
1. Regex: /\[MEDITACAO:(\w+)\]/i
2. Se encontrar:
   - Extrair categoria
   - Remover tag do texto
   - Fazer fetch para send-meditation com { category, user_id, phone }
   - Log do envio
3. Continuar fluxo normal (o texto limpo sera enviado como mensagem de texto normal)
```

A meditacao sera enviada em paralelo -- a AURA manda o texto de introducao como mensagem normal, e o `send-meditation` envia o audio separadamente (ele ja tem sua propria mensagem de introducao com titulo e duracao).

**Mudanca 3 - Ajustar para evitar duplicacao de intro:**

Como o `send-meditation` ja envia uma mensagem de introducao ("Meditacao Guiada - Duracao: X min"), a AURA deve manter sua mensagem curta e complementar, sem repetir informacoes de duracao ou titulo.

### Resultado esperado

- Quando o usuario pedir meditacao ou a situacao indicar, a AURA envia o audio pre-gravado da biblioteca
- O audio e de alta qualidade (gerado previamente com voz Erinome)
- O historico de meditacoes e registrado para evitar repeticao
- A AURA NAO gera audio TTS para meditacoes -- usa os pre-gravados

