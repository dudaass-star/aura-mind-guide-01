

## Reenviar dunning para clientes com falha de pagamento

### Problema
A instância WhatsApp ficou fora por 24h+. O Stripe disparou `invoice.payment_failed` para os trials que venceram, mas as mensagens de dunning via WhatsApp falharam porque a instância estava desconectada.

### Análise
- **5 clientes** tiveram trial expirando em **28/03** (ontem) com pagamento falho
- **3 clientes** tiveram trial expirando em **29/03** (hoje) com pagamento falho
- Total: **8 clientes** com assinaturas `past_due` que precisam receber dunning

**Risco**: Muitos perfis foram deletados na limpeza anterior. Precisamos verificar quais desses customer_ids ainda têm perfil no banco antes de enviar.

### Plano de execução

**Passo 1**: Verificar no banco quais desses 8 customer_ids (via phone/email no Stripe metadata) ainda têm perfil ativo

**Passo 2**: Para os que têm perfil, chamar a Edge Function `reprocess-dunning` com os customer_ids:
```
POST /functions/v1/reprocess-dunning
{
  "customer_ids": [
    "cus_UBjE0k0TFU8AGy",
    "cus_UBiymuDEw5Stun", 
    "cus_UBgZfYd2kwvZJw",
    "cus_UBgFkGccEBATZH",
    "cus_UBgBqfe46V5h2k",
    "cus_UCDNwa9wsSJ4Wl",
    "cus_UC1F3pMntQcTmh",
    "cus_UC0e608yJyTITc"
  ]
}
```

A função `reprocess-dunning` já faz:
1. Busca o customer no Stripe
2. Resolve o perfil via phone/email (profile-resolver)
3. Atualiza `payment_failed_at` no perfil
4. Gera link do Billing Portal
5. Encurta o link
6. Envia WhatsApp com mensagem de dunning empática + link

**Passo 3**: Para os que NÃO têm perfil (deletados), cancelar as assinaturas `past_due` no Stripe para evitar cobranças fantasma

**Passo 4**: Para `cus_UBgZfYd2kwvZJw` que tem 2 assinaturas duplicadas, cancelar a duplicata

### Detalhes técnicos
- A função `reprocess-dunning` já existe e lida com todos os cenários (perfil não encontrado, falha de envio, etc.)
- Registra tudo na tabela `dunning_attempts` para auditoria
- Precisa apenas ser invocada via `curl` ou `supabase.functions.invoke()`

