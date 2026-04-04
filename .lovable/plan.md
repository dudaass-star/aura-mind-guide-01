

## Plano: Botão WhatsApp nas páginas de confirmação + E-mail de boas-vindas

### O que será feito

**1. Adicionar botão "Chamar a AURA no WhatsApp" nas páginas de confirmação**
- **ThankYou.tsx** (`/obrigado`): Adicionar botão WhatsApp logo abaixo do bloco "Fique de olho no seu celular" (mantendo o bloco existente)
- **TrialStarted.tsx** (`/trial-iniciado`): Adicionar botão WhatsApp logo abaixo do texto "Olha seu WhatsApp" (mantendo o texto existente)
- Botão usa `variant="whatsapp"` com link `https://wa.me/16625255005?text=Oi%20AURA`
- Abre em nova aba (`target="_blank"`)

**2. Criar template de e-mail de boas-vindas**
- Novo arquivo `supabase/functions/_shared/transactional-email-templates/welcome.tsx`
- Conteúdo espelha as páginas de confirmação: saudação personalizada, dicas de "como aproveitar", e botão verde "Chamar a AURA no WhatsApp" apontando para `https://wa.me/16625255005?text=Oi%20AURA`
- Registrar no `registry.ts`

**3. Disparar e-mail de boas-vindas no stripe-webhook**
- Após criar o perfil e enviar a mensagem WhatsApp (linhas ~336), adicionar chamada ao `send-transactional-email` com `templateName: 'welcome'`
- Usa o e-mail do cliente (`customerEmail`)
- `idempotencyKey: welcome-${session.id}`
- `templateData: { name: customerName }`
- Funciona como reforço — mesmo que o WhatsApp falhe (templates pendentes), o e-mail chega

### Detalhes técnicos
- O e-mail será enviado via infraestrutura transacional já existente (`send-transactional-email` + fila pgmq)
- O botão WhatsApp no e-mail resolve o problema dos templates pendentes: o usuário inicia a conversa, abrindo a janela de 24h
- Deploy necessário: `send-transactional-email` (template novo) + `stripe-webhook` (trigger novo)

