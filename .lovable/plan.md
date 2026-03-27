

## Investigação detalhada: por que o dunning da Michele falhou silenciosamente

### Análise do fluxo `invoice.payment_failed` (linhas 568-718)

O código segue estes passos:
1. Inicializa `dunningRecord` (linhas 574-579)
2. `if (invoice.subscription)` → entra no bloco (linha 581)
3. `stripe.customers.retrieve` (linha 583)
4. `resolveProfileFromCustomer` (linha 596)
5. Update do profile (linha 612)
6. Cria Billing Portal session (linha 635)
7. Cria short link via fetch interno (linha 646)
8. Envia WhatsApp via fetch interno (linha 678)
9. **Finalmente** insere `dunning_attempts` (linha 709)

### Causas identificadas

**Causa 1 (MAIS PROVÁVEL): Response body não consumido → resource leak → crash do Deno**

Na linha 692-699, quando o envio do WhatsApp **tem sucesso**, o body do `msgResponse` **NÃO é consumido**:
```typescript
} else {
  dunningRecord.whatsapp_sent = true;  // seta flag
  console.log('✅ Dunning WhatsApp sent to:', profile.phone);
  // ❌ FALTA: await msgResponse.text()
}
```

Mesma coisa na linha 663 — quando `shortLinkResponse` falha, o body não é consumido.

No Deno, não consumir o body causa resource leak que pode terminar a função **antes** de chegar na linha 709 (`insert dunning_attempts`). Isso explica por que:
- O evento foi registrado em `stripe_webhook_events` (acontece no início)
- O perfil pode ter sido atualizado parcialmente
- Mas NENHUM `dunning_attempts` foi inserido (acontece no final)

**Causa 2: Insert do dunning no final, não incrementalmente**

O `dunningRecord` só é inserido na linha 709, **depois de todos os passos**. Se qualquer coisa crashar antes, o audit trail é perdido. Isso é um design frágil.

**Causa 3: Timeout da Edge Function**

O handler faz 4 chamadas de rede sequenciais (Stripe retrieve, billing portal, short link fetch, WhatsApp fetch). Se alguma for lenta, a função pode dar timeout antes do insert final.

### Plano de correção

**Arquivo**: `supabase/functions/stripe-webhook/index.ts`

#### Fix 1: Consumir todos os response bodies
- Linha 697: adicionar `await msgResponse.text()` no branch de sucesso do WhatsApp
- Linha 663: adicionar `await shortLinkResponse.text()` no branch de falha do short link

#### Fix 2: Inserir dunning record mais cedo (fail-safe)
- Inserir um registro de dunning **logo após encontrar o profile** (com status parcial)
- Atualizar o registro ao final com o resultado do WhatsApp
- Isso garante que mesmo em caso de crash, temos um registro

#### Mudanças específicas

```typescript
// Após encontrar o profile (linha 609), inserir registro parcial:
dunningRecord.profile_found = true;
dunningRecord.profile_user_id = profile.user_id;
const { data: insertedDunning } = await supabase
  .from('dunning_attempts')
  .insert({ ...dunningRecord, error_stage: 'in_progress' })
  .select('id')
  .single();

// ... resto do fluxo (portal, short link, whatsapp) ...

// No final (linha 709), ATUALIZAR em vez de inserir:
if (insertedDunning?.id) {
  await supabase.from('dunning_attempts')
    .update({ 
      whatsapp_sent: dunningRecord.whatsapp_sent || false,
      link_generated: dunningRecord.link_generated || false,
      error_stage: dunningRecord.error_stage || null,
      error_message: dunningRecord.error_message || null,
    })
    .eq('id', insertedDunning.id);
}
```

E consumir os bodies:
```typescript
// Linha ~697 (sucesso do WhatsApp)
await msgResponse.text(); // consumir body

// Linha ~663 (falha do short link) 
await shortLinkResponse.text(); // consumir body
```

### Resultado

- **Resource leaks eliminados** → sem crashes silenciosos
- **Audit trail garantido** → registro parcial inserido cedo, atualizado no final
- **Diagnóstico futuro** → se crashar, o registro fica com `error_stage: 'in_progress'` em vez de desaparecer completamente

