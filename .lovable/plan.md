

## Plano: Corrigir reengagement-blast para capturar todos os 23 usuários com assinatura Stripe

### Problema atual

A função `reengagement-blast` busca perfis no banco e depois tenta encontrar o customer no Stripe por email ou phone. Isso falha quando:
- O email no banco não bate com o email no Stripe
- O phone no metadata do Stripe está em formato diferente
- Resultado: só encontra 12 de 23

### Solução

Inverter a lógica: partir do Stripe (fonte da verdade) para o banco.

1. Listar todas as subscriptions `active` + `trialing` do Stripe
2. Para cada subscription, pegar o customer e extrair phone/email dos metadados
3. Buscar o perfil correspondente no banco pelo phone
4. Se `last_user_message_at IS NULL`, incluir na lista de envio
5. Enviar via `sendProactive` com template `reconnect` e `[nome]` como variável

### Mudanças

| Componente | Acao |
|---|---|
| `supabase/functions/reengagement-blast/index.ts` | Reescrever para partir das subscriptions do Stripe em vez dos perfis do banco |

### Fluxo tecnico

```text
1. stripe.subscriptions.list(status: 'active') + stripe.subscriptions.list(status: 'trialing')
2. Para cada sub: expand customer → pegar phone do metadata + email
3. Buscar profile no banco por phone normalizado
4. Se profile existe E last_user_message_at IS NULL → elegível
5. Se profile não existe → reportar como "sem perfil"
6. Enviar com sendProactive(phone, msg, 'reconnect', userId, undefined, [nome])
```

### Segurança

- dry_run mode mantido
- Anti-burst 500ms entre envios
- Horário silencioso (22h-8h BRT) mantido
- Log de cada envio na tabela messages

