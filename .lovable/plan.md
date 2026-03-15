

## Plano: Mensagem de áudio logo após boas-vindas

Enviar uma segunda mensagem automática ~5 segundos após a welcome message, informando sobre a funcionalidade de áudio.

### Mudança em `supabase/functions/start-trial/index.ts`

Após o envio da `welcomeMessage`, adicionar um segundo `sendTextMessage` com delay de typing (~3s) com algo como:

```
Ah, e se preferir, pode me mandar áudio também! 🎙️ Eu ouço e respondo — por texto ou por voz, como você preferir.
```

Usar `delayTyping: 3` para simular uma pausa natural entre as duas mensagens.

### Arquivos afetados
1. **`supabase/functions/start-trial/index.ts`** — adicionar segundo `sendTextMessage` após o welcome

