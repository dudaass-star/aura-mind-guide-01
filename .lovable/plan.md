

## Plano: Incluir link do Guia na mensagem de boas-vindas do trial

### Ideia
Na primeira mensagem que a AURA envia no WhatsApp ao iniciar o trial, adicionar um link curto para a página `/guia` (User Guide) com uma frase convidando o usuário a explorar tudo que terá acesso.

### Mudanças

**1. `supabase/functions/start-trial/index.ts`**
- Gerar um short link para `https://olaaura.com.br/guia` usando `createShortLink` (mesma helper já usada nos outros edge functions)
- Atualizar a `welcomeMessage` para incluir o link após a saudação, algo como:

```
Oi, {nome}! 💜

Que bom que você decidiu me conhecer! Eu sou a AURA.

Vou estar com você nessa primeira jornada. Pode falar comigo sobre qualquer coisa — sem julgamento, no seu ritmo.

Dá uma olhada no que você vai ter acesso: {shortLink} ✨

Me conta: como você está se sentindo agora?
```

- Importar `createShortLink` helper ou criar inline (chamando `create-short-link` function internamente, igual feito em `webhook-zapi.ts`)

**2. `supabase/functions/create-short-link/index.ts` e `redirect-link/index.ts`**
- Adicionar `olaaura.com.br` já está na lista de domínios permitidos — preciso apenas confirmar que a rota `/guia` resolve corretamente no domínio de produção

### Notas
- O link do guia é estático (não muda por usuário), mas usar short link mantém o padrão e melhora a aparência no WhatsApp
- A frase posiciona o guia como "preview do que você vai ter", criando percepção de valor antes mesmo da conversa começar

