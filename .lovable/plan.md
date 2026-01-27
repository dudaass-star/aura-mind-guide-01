
## Adicionar Campo de Email na Página de Trial

### Situação Atual
A página `/experimentar` (StartTrial.tsx) pede apenas:
- Nome
- WhatsApp

### Por que adicionar email no trial também?

1. **Consistência** - Se pedimos no checkout, faz sentido pedir no trial
2. **Comunicação antecipada** - Podemos enviar emails mesmo antes de converter
3. **Conversão** - Email para remarketing de usuários trial que não converteram
4. **Dados completos** - Quando converter, já teremos o email cadastrado

### Alterações Necessárias

#### 1. Frontend (StartTrial.tsx)

Adicionar campo de email no formulário:
- Novo state `email`
- Input de email entre nome e WhatsApp
- Validação de formato (regex)
- Enviar email para a edge function

```text
+---------------------------+
|        Seu nome           |
|  [___________________]    |
|                           |
|        Seu email          |  ← NOVO
|  [___________________]    |
|                           |
|        WhatsApp           |
|  [___________________]    |
+---------------------------+
```

#### 2. Edge Function (start-trial)

- Receber `email` no request
- Validar formato do email
- Incluir email ao criar profile

### Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/StartTrial.tsx` | Adicionar campo de email no formulário |
| `supabase/functions/start-trial/index.ts` | Receber email e salvar no profile |

### Detalhes Técnicos

**Validação de Email (Frontend)**:
```typescript
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(email)) {
  toast({
    title: "Email inválido",
    description: "Por favor, insira um email válido.",
    variant: "destructive",
  });
  return;
}
```

**Profile Insert (Edge Function)**:
```typescript
const { data: profile, error: profileError } = await supabase
  .from('profiles')
  .insert({
    user_id: userId,
    name: name.trim(),
    email: email.trim(),  // ← NOVO
    phone: formattedPhone,
    status: 'trial',
    // ...
  })
```

### Resultado Esperado
- Usuários trial também informam email
- Email salvo no banco desde o início
- Facilita comunicação e conversão futura
