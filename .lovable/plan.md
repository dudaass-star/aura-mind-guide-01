## Exportar todos os clientes que já cadastraram cartão

Atualizar a edge function `temp-export-card-customers` para iterar por **todos os Charges** da conta Stripe (sem filtro de status), capturando qualquer cliente que tenha submetido um cartão em algum momento — inclusive trials cancelados, cartões recusados e PaymentMethods já desanexados.

### Lógica
1. Paginar `stripe.charges.list({ limit: 100 })` com `starting_after` até esgotar.
2. Filtrar onde `payment_method_details.type === 'card'`.
3. Coletar dados do `customer` (se existir) ou do `billing_details` do charge como fallback.
4. Deduplicar por **email normalizado** (lowercase, trim), mantendo o registro mais completo / mais recente.
5. Normalizar telefone via `normalizeBrazilianPhone` e prefixar `+`.
6. Retornar JSON com `rows: [{ nome_completo, email, telefone_e164 }]`.

### Execução
- Deploy da função.
- Invocar via curl (pode levar 60-150s dependendo do volume).
- Converter resposta em CSV e salvar em `/mnt/documents/clientes_com_cartao_v2.csv`.
- Entregar como `<presentation-artifact>`.

### Observação técnica
Se o volume de charges exceder o timeout da edge function, a função aceitará parâmetro `starting_after` para continuar de onde parou, e farei chamadas em lote.
