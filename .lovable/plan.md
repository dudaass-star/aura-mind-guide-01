

## Plano: Corrigir perfil da Jenoelma e investigar bug de formatação

### Problema
O perfil da usuária Jenoelma Barboza (email: elmaricardorosa@gmail.com) tem o telefone salvo como `5555129961510` quando deveria ser `5512996151077`. Por isso, todas as mensagens da Aura foram enviadas para um número inexistente.

### Ação imediata

1. **Corrigir o telefone no perfil** via migration SQL:
   ```sql
   UPDATE profiles SET phone = '5512996151077' WHERE id = '71994c91-b86e-47a1-947f-038a0fc1887b';
   ```

2. **Atualizar o status** de `trial` para `active` (o checkout foi completado em 03/04, há 10 dias — o trial de 7 dias já expirou mas ela pagou):
   - Verificar no Stripe se a assinatura está ativa antes de atualizar

### Investigação do bug

3. **Verificar a lógica de limpeza de telefone** no `stripe-webhook` e `start-trial` — o número `12996151077` (sem DDI) foi transformado em `5555129961510`, o que indica um bug na função `cleanPhoneNumber` ou na forma como o telefone é passado do checkout para o webhook.

### Detalhes técnicos
- Perfil ID: `71994c91-b86e-47a1-947f-038a0fc1887b`
- User ID: `ff7ca625-1c12-48e2-a844-d256a35feb32`
- Telefone atual (errado): `5555129961510`
- Telefone correto: `5512996151077`
- Arquivos a investigar: `supabase/functions/stripe-webhook/index.ts`, `supabase/functions/_shared/zapi-client.ts` (função `cleanPhoneNumber`)

