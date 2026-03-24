

# Diagnóstico: 3 problemas encontrados

## 1. Contagem errada de mensagens

**Causa raiz**: Não é bug de código — foi erro meu na query SQL. O `admin-messages` está correto (paginação de 200 com "carregar anteriores" funciona). O problema foi que nas minhas queries ad-hoc eu usei filtros de timezone errados (UTC em vez de BRT), o que cortou mensagens do dia. O código da aplicação em si **não tem bug** aqui.

**Ação**: Nenhuma mudança de código necessária. Apenas disciplina nas queries manuais.

---

## 2. `trial_conversations_count` sempre em 0

**Causa raiz**: O campo `trial_conversations_count` é setado para `0` na criação do trial (`start-trial/index.ts` linha 115), mas **nunca é incrementado em lugar nenhum**. Nem o `process-webhook-message` nem o `aura-agent` fazem `UPDATE profiles SET trial_conversations_count = trial_conversations_count + 1`.

Isso explica por que a Maria Jacqueline apareceu com `trial_conversations_count = 0` mesmo tendo 132+ mensagens, e por que o dashboard de engajamento mostra dados de conversão incorretos (depende desse campo para calcular `trialRespondedCount`, `avgMsgsConverted`, etc.).

**Correção**: Adicionar incremento no `process-webhook-message`, logo após salvar a mensagem inbound do usuário. Só incrementar se `profile.status === 'trial'`:

```typescript
// Após persistir mensagem inbound, se trial, incrementar contador
if (profile.status === 'trial') {
  await supabase
    .from('profiles')
    .update({ trial_conversations_count: (profile.trial_conversations_count || 0) + 1 })
    .eq('id', profile.id);
}
```

**Arquivo**: `supabase/functions/process-webhook-message/index.ts`

---

## 3. Preço do plano Direção errado

**Causa raiz**: Não há nenhum lugar no código que defina os preços dos planos de forma centralizada para uso em análises. Os preços corretos estão no `aura-agent` (R$ 49,90/mês para Direção), mas a tabela `plan_configs` pode ter valores desatualizados no campo `price_monthly_cents`.

O erro foi meu ao citar R$ 149/mês — esse valor não existe em nenhum lugar do código. Os preços reais são:
- **Essencial**: R$ 29,90/mês
- **Direção**: R$ 49,90/mês  
- **Transformação**: R$ 79,90/mês

**Correção**: Verificar e atualizar a tabela `plan_configs` com os valores corretos de `price_monthly_cents` para garantir que qualquer futuro cálculo de viabilidade econômica use os preços certos.

---

## Resumo de ações

| Problema | Tipo | Ação |
|----------|------|------|
| Contagem de mensagens errada | Erro operacional meu | Nenhuma mudança de código |
| `trial_conversations_count` sempre 0 | Bug real | Adicionar incremento no `process-webhook-message` |
| Preço do Direção errado | Erro operacional meu + possível dado desatualizado | Verificar/atualizar `plan_configs` |

