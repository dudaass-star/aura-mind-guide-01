

## Simplificar Página ThankYou: Remover Botão de WhatsApp

### Problema
O botão "Abrir WhatsApp e começar" é desnecessário porque:
- A AURA já envia mensagem de boas-vindas automaticamente via webhook
- O botão usa um número placeholder que não funciona
- Pode confundir o usuário sobre como iniciar

### Solução
Substituir o botão por uma mensagem informativa que explica o que vai acontecer.

### Alterações em `src/pages/ThankYou.tsx`

**Remover:**
- Variáveis `whatsappNumber`, `whatsappMessage`, `whatsappUrl`
- Botão com link para WhatsApp
- Import do ícone `MessageCircle`

**Adicionar:**
Substituir a área do CTA por uma mensagem como:

```text
📱 A AURA vai te mandar uma mensagem no WhatsApp em instantes.
Fique de olho no seu celular!
```

### Resultado Visual Esperado

**Antes:**
- Botão verde "Abrir WhatsApp e começar"
- Texto "A AURA já está esperando por você"

**Depois:**
- Ícone de celular/mensagem
- Texto informativo: "A AURA vai te mandar uma mensagem no WhatsApp em instantes"
- Subtexto: "Fique de olho no seu celular!"

### Benefícios
- Remove código morto (número placeholder)
- Alinha expectativa do usuário com o fluxo real
- Experiência mais passiva e elegante — o usuário só espera

