## Exportar lista de usuários com cartão na Ola Aura

Gerar um CSV em `/mnt/documents/` com todos os clientes Stripe que possuem cartão cadastrado (PaymentMethod tipo `card` anexado ao customer, ou que já completaram pelo menos um checkout com cartão).

### Critério de inclusão
Cliente Stripe que tenha **pelo menos um PaymentMethod do tipo `card` anexado** — isso cobre:
- Assinantes ativos
- Trials semanais (que salvam o cartão off_session)
- Past_due / canceled (cartão segue anexado)
- Quem pagou one-time com cartão salvo

Exclui: customers só com Boleto/PIX e customers sem nenhum cartão anexado.

### Colunas do CSV
| Coluna | Origem |
|---|---|
| `nome_completo` | `customer.name` |
| `email` | `customer.email` |
| `telefone_e164` | `customer.metadata.phone` normalizado para `+55DDD9XXXXXXXX` (reusa `normalizeBrazilianPhone` do `_shared/zapi-client.ts`) |

### Como vou executar
1. Edge function temporária `export-card-customers` que:
   - Pagina por todos os customers (`stripe.customers.list`, `limit: 100`, loop)
   - Para cada um, busca `paymentMethods.list({ customer, type: 'card' })`
   - Mantém se houver ≥1 cartão
   - Normaliza telefone com `normalizeBrazilianPhone` e prefixa `+`
   - Devolve array JSON
2. Invoco a function, recebo o JSON, escrevo o CSV em `/mnt/documents/clientes_com_cartao.csv`
3. Entrego com `<presentation-artifact>`

Deduplico por email (em caso de customers duplicados, fico com o mais recente que tenha cartão).

### Saída
Arquivo `clientes_com_cartao.csv` (UTF-8, header em PT-BR, separador `,`).
