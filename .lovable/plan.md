

# Fix: Espaço no número `From` do Twilio

## Problema encontrado

O erro do Twilio é explícito:
```text
The 'From' number whatsapp: +12604684990 is not a valid phone number
```

O secret `TWILIO_WHATSAPP_FROM` foi salvo com um **espaço** após `whatsapp:`. A função `getFromNumber()` detecta o prefixo `whatsapp:` e retorna o valor bruto sem limpar o espaço.

## Correção

Atualizar `getFromNumber()` em `whatsapp-official.ts` para extrair apenas os dígitos e reconstruir o formato correto, independentemente de espaços ou formatação do secret:

```typescript
function getFromNumber(): string {
  const raw = Deno.env.get('TWILIO_WHATSAPP_FROM');
  if (!raw) throw new Error('TWILIO_WHATSAPP_FROM is not configured');
  // Always extract digits and rebuild to avoid whitespace/formatting issues
  const digits = raw.replace(/\D/g, '');
  return `whatsapp:+${digits}`;
}
```

Isso garante que qualquer variação (`whatsapp: +123`, `whatsapp:+123`, `+123`, `123`) seja normalizada para `whatsapp:+123`.

## Teste

Após o deploy, invocar `admin-send-message` novamente para confirmar a entrega.

