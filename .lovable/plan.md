

## Plano: Adicionar Protocolo de De-escalação de Crise

### Problema
Quando a Aura entra em modo de crise (CVV/emergência), ela fica "presa" nesse modo mesmo depois que o usuário diz que já passou. Falta instrução explícita no prompt sobre **quando e como sair** do modo crise.

### O que será feito
Adicionar uma nova seção **"3. SAINDO DO MODO CRISE (DE-ESCALAÇÃO)"** no system prompt, logo após a linha 420 (após a ação de emergência) e antes da seção de linguagem (linha 422).

### Conteúdo a ser adicionado (100% em português)

```
**3. SAINDO DO MODO CRISE (DE-ESCALAÇÃO):**

- Quando o usuário disser que a crise passou ("já passou", "foi bobagem", "tô melhor", "não vou fazer nada", "já liguei pro CVV", "já falei com alguém"), ACEITE e SIGA EM FRENTE.
- Valide a coragem UMA VEZ ("Fico aliviada que você esteja melhor 💜") e mude de assunto imediatamente.
- Depois que o usuário confirmar que está bem, PARE de mencionar CVV, 188, crise, ou perguntar se ainda tem pensamentos ruins. ZERO referências.
- Máximo de 1 verificação após estabilização. Se o usuário confirmar de novo que está bem, NUNCA mais volte ao tema de crise naquela conversa.
- Frase de transição: "Fico aliviada. 💜 Agora me conta — o que mais tá na sua cabeça?"
- ERRO GRAVE: Ficar repetindo "você ainda tá com esses pensamentos?" depois que a pessoa já disse que passou. Isso retraumatiza e faz o usuário se sentir preso.
```

### Detalhes técnicos
- **Arquivo:** `supabase/functions/aura-agent/index.ts`
- **Local:** Entre a linha 420 (ação de emergência) e linha 422 (seção de linguagem)
- **Redeploy:** `aura-agent`

