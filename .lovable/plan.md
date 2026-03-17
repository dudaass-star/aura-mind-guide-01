

## Plano: Corrigir Extração de Tema para Trial Closing

### O Problema

Quando o trial do usuário acaba, o sistema agenda uma mensagem de upgrade (`trial_closing`). Para personalizar, ele tenta extrair o "tema" da conversa. A lógica atual (webhook-zapi, linhas 546-549):

1. Pega as últimas 5 mensagens do usuário
2. Escolhe a mais longa
3. Faz `substring(0, 80)` do texto cru

Resultado: a mensagem da pessoa é colada literalmente na frase de venda. "Especialmente sobre Tá bom... eu vou te falar a verdade, amada, eu sou candomble..." — constrangedor e quebra confiança.

### A Solução

Usar a IA (Lovable AI Gateway) para extrair um tema real a partir das mensagens recentes, em vez de colar texto cru.

**Duas mudanças:**

#### 1. `webhook-zapi/index.ts` (~linha 545-549)

Substituir a lógica de "mensagem mais longa" por uma chamada ao Lovable AI Gateway que recebe as últimas 5 mensagens do usuário e retorna um tema resumido em 3-5 palavras (ex: "sua espiritualidade e fé", "a ansiedade no trabalho", "o luto pela sua mãe").

Prompt para o modelo:
```
Extraia o tema principal dessas mensagens em 3-6 palavras, 
em português informal. Retorne APENAS o tema, sem aspas nem pontuação final.
Exemplos: "sua relação com a espiritualidade", "a ansiedade antes de dormir"
```

Modelo: `google/gemini-2.5-flash-lite` (mais rápido/barato, suficiente para extração simples).

Fallback: se a chamada falhar, usar string vazia (cai no template genérico "te ouvir e caminhar junto com você").

#### 2. `execute-scheduled-tasks/index.ts` (linha 217)

Nenhuma mudança necessária — o template já lida com `theme` vazio vs preenchido. Só precisa garantir que o tema extraído pela IA faz sentido no contexto da frase "especialmente sobre {tema}".

### Segurança

- Limitar resposta do modelo a 100 chars para evitar injeção
- Strip de quebras de linha e caracteres especiais
- Timeout de 5s na chamada, fallback para tema vazio

### Deploy

Redeploy `webhook-zapi`.

