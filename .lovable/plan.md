

## Plano: Migrar Dunning e Checkout Recovery para Email + Exit-Intent Popup

### Contexto

O número WhatsApp foi banido pela Meta. Para evitar futuros banimentos, as mensagens proativas de **dunning** (falha de pagamento) e **checkout recovery** (abandono de checkout) devem ser enviadas **exclusivamente por email** em vez de WhatsApp. Além disso, um **popup de exit-intent** será adicionado na página de checkout para reter clientes antes do abandono.

O domínio de email `notify.olaaura.com.br` já está verificado e ativo. O projeto já usa `@lovable.dev/email-js` (na função `notify-users-email`), mas ainda não tem infraestrutura de email transacional scaffoldada.

---

### O que muda

**1. Configurar infraestrutura de email transacional**
- Preparar a infraestrutura de filas e funções para envio de emails transacionais (necessário uma única vez).

**2. Criar template de email: Dunning (falha de pagamento)**
- Email empático em português com o nome do usuário e link para o Billing Portal do Stripe.
- Estilo visual consistente com os emails existentes da Aura (verde, Fraunces/Nunito).

**3. Criar template de email: Checkout Recovery (abandono)**
- Email convidando o cliente a retomar o checkout, com link direto para a página de pagamento.
- Tom acolhedor, consistente com a marca.

**4. Alterar `stripe-webhook` — bloco `invoice.payment_failed`**
- Substituir `sendProactive()` (WhatsApp) por envio de email via `send-transactional-email`.
- Usar o email do perfil ou do customer do Stripe.
- Manter toda a lógica de audit trail (dunning_attempts) intacta.
- Atualizar campo de auditoria de `whatsapp_sent` para `email_sent`.

**5. Alterar `recover-abandoned-checkout`**
- Substituir `sendProactive()` por envio de email via `send-transactional-email`.
- Usar o email da `checkout_sessions` (já disponível no registro).
- Remover dependência de telefone como canal primário (manter para auditoria).
- Remover quiet hours (email não tem restrição de horário).

**6. Alterar `reprocess-dunning`**
- Mesma mudança: substituir WhatsApp por email.

**7. Criar popup de exit-intent na página de Checkout**
- Detectar quando o mouse sai da viewport (desktop) ou `visibilitychange` (mobile).
- Exibir popup com mensagem tipo: "Ei, não vai embora! 💜 Você estava tão perto de começar..."
- Botão principal para retomar o checkout.
- Mostrar apenas 1 vez por sessão (localStorage flag).
- Não exibir se o usuário já clicou em "Pagar" (já redirecionou para o Stripe).

**8. Criar página de unsubscribe**
- Página simples para o usuário confirmar que quer parar de receber emails, conforme requisito da infraestrutura transacional.

---

### Arquivos modificados

| Arquivo | Ação |
|---------|------|
| `supabase/functions/_shared/transactional-email-templates/` | Novos templates (dunning + recovery) |
| `supabase/functions/stripe-webhook/index.ts` | WhatsApp → Email no bloco dunning |
| `supabase/functions/recover-abandoned-checkout/index.ts` | WhatsApp → Email |
| `supabase/functions/reprocess-dunning/index.ts` | WhatsApp → Email |
| `src/pages/Checkout.tsx` | Adicionar popup exit-intent |
| `src/pages/Unsubscribe.tsx` | Nova página de unsubscribe |
| `src/App.tsx` | Rota `/unsubscribe` |

### O que NÃO muda
- Mensagens de boas-vindas, follow-up, check-in e outras conversacionais continuam por WhatsApp (quando o sender voltar).
- Tabelas `dunning_attempts` e `checkout_recovery_attempts` permanecem iguais, apenas o canal muda.

