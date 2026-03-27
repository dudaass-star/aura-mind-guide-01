

## Reprocessar eventos `invoice.payment_failed` manualmente

### Contexto
- Os 3 clientes (`cus_UAhZTJTZvtDoqR`, `cus_UAdbpvu3TvcFBz`, `cus_UAWmyKzRFHncY5`) têm invoices em status "open" com pagamento pendente.
- Os nomes `cus_...` são IDs internos do Stripe — todo cliente recebe um ID nesse formato. O nome real (ex: "João Silva") fica dentro do objeto `customer` no Stripe e será usado na mensagem de dunning.
- O webhook original provavelmente não encontrou o perfil por mismatch de telefone (já corrigido com o `profile-resolver`).

### Plano

**Criar uma edge function `reprocess-dunning`** que:
1. Recebe uma lista de customer IDs
2. Para cada customer:
   - Busca o customer no Stripe para obter phone/email/name
   - Usa o `resolveProfile` (já corrigido) para encontrar o perfil
   - Executa o mesmo fluxo do handler `invoice.payment_failed`: gravar `payment_failed_at`, criar link do Billing Portal, encurtar URL, enviar WhatsApp
   - Registra o resultado na tabela `dunning_attempts`
3. Retorna um relatório com o status de cada cliente

### Detalhes técnicos

- **Arquivo**: `supabase/functions/reprocess-dunning/index.ts`
- Reutiliza `resolveProfile` de `_shared/profile-resolver.ts`
- Protegido por `Authorization: Bearer <service_role_key>`
- Adicionar config em `supabase/config.toml` com `verify_jwt = false`
- A function será invocada uma vez manualmente para os 3 clientes

