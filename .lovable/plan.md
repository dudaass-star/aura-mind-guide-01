

## Plano: Reenvio de reconexão para trials com cartão cadastrado

### Situação atual

- O template `aura_reconnect_v2` (ContentSid: `HX824b3f789beb78ace2a1f38d8527c718`) esta **ativo** e funciona
- A função `instance-reconnect-notify` ja usa `sendProactive` com `templateVariables: [nome]` (variavel curta) -- correto
- O problema anterior era enviar texto longo como variavel; isso ja foi corrigido no codigo

### O que precisa ser feito

Criar uma edge function `reengagement-blast` que:

1. Busca perfis com `status IN ('active', 'trial')`, telefone valido, e `last_user_message_at IS NULL` (nunca falaram com o numero novo)
2. **Cruza com Stripe** para garantir que so envia para quem tem assinatura `trialing` ou `active` (trial com cartao)
3. Exclui Admin e Eduardo (ja ativos)
4. Envia via `sendProactive` com categoria `reconnect` e `templateVariables: [primeiro_nome]`
5. Anti-burst: 500ms entre envios
6. Suporta `dry_run: true` para validar a lista antes de enviar

### Por que nao reutilizar `instance-reconnect-notify`

- Filtra por `whatsapp_instance_id IS NOT NULL` (exclui ~15 usuarios)
- Nao verifica assinatura no Stripe
- Nao tem filtro por `last_user_message_at`
- Nao tem modo `dry_run`

### Mudancas

| Componente | Acao |
|---|---|
| `supabase/functions/reengagement-blast/index.ts` | Nova edge function |
| `supabase/config.toml` | Adicionar `verify_jwt = false` |

### Fluxo tecnico

```text
1. Busca profiles (active/trial, phone NOT NULL, last_user_message_at IS NULL)
2. Exclui Admin (phone = 'test-admin')
3. Para cada usuario:
   a. Busca customer no Stripe pelo phone/email
   b. Verifica se tem subscription trialing ou active
   c. Se sim: sendProactive(phone, msg, 'reconnect', userId, undefined, undefined, [nome])
   d. Se nao: skip (trial legado sem cartao)
4. Retorna relatorio: enviados, pulados (sem Stripe), erros
```

### Fluxo de uso

1. Deploy da funcao
2. Chamar com `{ "dry_run": true }` para ver a lista
3. Confirmar e chamar com `{ "dry_run": false }` para enviar

