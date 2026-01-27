
## Simplificar Página ThankYou

### Objetivo
Remover o botão de WhatsApp com número placeholder e substituir por uma mensagem informativa, já que a AURA envia a mensagem de boas-vindas automaticamente após o checkout.

### Alterações em `src/pages/ThankYou.tsx`

#### 1. Remover imports e variáveis desnecessárias
- Remover `MessageCircle` do import de lucide-react (linha 4)
- Remover `Button` do import (linha 2) — não será mais usado
- Remover variáveis `whatsappNumber`, `whatsappMessage`, `whatsappUrl` (linhas 34-38)

#### 2. Atualizar a seção CTA (linhas 74-86)

**Antes:**
```text
Botão verde "Abrir WhatsApp e começar"
Texto: "A AURA já está esperando por você"
```

**Depois:**
```text
Ícone de smartphone com indicador
Título: "📱 Fique de olho no seu celular!"
Texto: "A AURA vai te mandar uma mensagem no WhatsApp em instantes para iniciar sua jornada."
```

#### 3. Adicionar novo ícone
- Importar `Smartphone` de lucide-react para o visual do aviso

### Código Final da Seção CTA

```tsx
{/* Aviso WhatsApp */}
<div className="space-y-3 animate-fade-up delay-200 p-6 bg-teal/10 rounded-2xl border border-teal/20">
  <div className="flex items-center justify-center gap-2">
    <Smartphone className="w-6 h-6 text-teal" />
    <span className="font-display text-lg font-semibold text-foreground">
      Fique de olho no seu celular!
    </span>
  </div>
  <p className="text-muted-foreground">
    A AURA vai te mandar uma mensagem no WhatsApp em instantes para iniciar sua jornada.
  </p>
</div>
```

### Benefícios
- Remove código morto (número placeholder que não funciona)
- Alinha a expectativa do usuário com o fluxo real automatizado
- Visual mais informativo e elegante
- Menos confusão sobre o que fazer após o checkout
