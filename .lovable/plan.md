

## Checklist: Transição Stripe Sandbox → Produção

### Pré-requisitos

- [ ] Conta Stripe ativada para pagamentos Live (verificação completa)
- [ ] Secrets de Price IDs configurados no projeto (implementação atual)
- [ ] Testes completos no ambiente Sandbox funcionando

---

### Parte 1: Configuração no Stripe Dashboard (Live Mode)

#### 1.1 Criar Produtos e Preços

Acessar **Stripe Dashboard** → Alternar para **Live Mode** (toggle no canto superior direito)

| Produto | Preço Mensal | Preço Anual |
|---------|--------------|-------------|
| Essencial | R$ 29,90/mês | R$ 269,10/ano (25% off) |
| Direção | R$ 49,90/mês | R$ 419,16/ano (30% off) |
| Transformação | R$ 79,90/mês | R$ 671,16/ano (30% off) |

**Passos:**
1. Ir em **Products** → **Add product**
2. Criar cada produto com nome e descrição
3. Adicionar dois preços por produto (mensal e anual)
4. **Anotar os 6 Price IDs gerados** (formato: `price_...`)

#### 1.2 Configurar Webhook

1. Ir em **Developers** → **Webhooks**
2. Clicar **Add endpoint**
3. URL: `https://uhyogifgmutfmbyhzzyo.supabase.co/functions/v1/stripe-webhook`
4. Selecionar eventos:
   - `checkout.session.completed`
   - `customer.subscription.deleted`
   - `customer.subscription.resumed`
5. Clicar **Add endpoint**
6. **Copiar o Signing Secret** (`whsec_...`)

#### 1.3 Obter API Key de Produção

1. Ir em **Developers** → **API keys**
2. **Copiar a Secret Key** (`sk_live_...`)

---

### Parte 2: Atualizar Secrets no Projeto

Acessar o painel de secrets do projeto e atualizar:

| Secret | Valor Atual (Sandbox) | Novo Valor (Produção) |
|--------|----------------------|----------------------|
| `STRIPE_SECRET_KEY` | `sk_test_...` | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` (test) | `whsec_...` (live) |
| `STRIPE_PRICE_ESSENCIAL_MONTHLY` | `price_1SlEYj...` | Novo ID Live |
| `STRIPE_PRICE_ESSENCIAL_YEARLY` | `price_1Sn2oP...` | Novo ID Live |
| `STRIPE_PRICE_DIRECAO_MONTHLY` | `price_1SlEb6...` | Novo ID Live |
| `STRIPE_PRICE_DIRECAO_YEARLY` | `price_1Sn2pA...` | Novo ID Live |
| `STRIPE_PRICE_TRANSFORMACAO_MONTHLY` | `price_1SlEcK...` | Novo ID Live |
| `STRIPE_PRICE_TRANSFORMACAO_YEARLY` | `price_1Sn2ps...` | Novo ID Live |

**Total: 8 secrets para atualizar**

---

### Parte 3: Verificação Pós-Transição

#### 3.1 Teste de Checkout
- [ ] Acessar página de checkout
- [ ] Selecionar um plano
- [ ] Verificar se redireciona para Stripe Checkout (ambiente Live)
- [ ] Usar cartão real (pequeno valor) OU cancelar antes de pagar

#### 3.2 Teste de Webhook
- [ ] Completar um pagamento real
- [ ] Verificar logs da edge function `stripe-webhook`
- [ ] Confirmar que o usuário foi criado/atualizado no banco

#### 3.3 Teste de Cancelamento
- [ ] Cancelar a assinatura no Stripe Dashboard
- [ ] Verificar se webhook de cancelamento foi recebido
- [ ] Confirmar atualização de status no banco

---

### Parte 4: Rollback (Se Necessário)

Para voltar ao Sandbox, reverter os 8 secrets para os valores originais:

```text
STRIPE_SECRET_KEY        → sk_test_...
STRIPE_WEBHOOK_SECRET    → whsec_... (do sandbox)
STRIPE_PRICE_*           → price_... (do sandbox)
```

---

### Diagrama de Fluxo

```text
┌─────────────────────────────────────────────────────────────────┐
│                    TRANSIÇÃO PARA PRODUÇÃO                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  STRIPE DASHBOARD (Live Mode)                                   │
│  ├── 1. Criar 3 produtos                                        │
│  ├── 2. Criar 6 preços (2 por produto)                          │
│  ├── 3. Configurar webhook com 3 eventos                        │
│  └── 4. Copiar API Key e Webhook Secret                         │
│                                                                 │
│  PROJETO (Secrets)                                              │
│  ├── 5. Atualizar STRIPE_SECRET_KEY                             │
│  ├── 6. Atualizar STRIPE_WEBHOOK_SECRET                         │
│  └── 7. Atualizar 6 STRIPE_PRICE_* IDs                          │
│                                                                 │
│  VERIFICAÇÃO                                                    │
│  ├── 8. Testar checkout completo                                │
│  ├── 9. Verificar logs de webhook                               │
│  └── 10. Confirmar dados no banco                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### Notas Importantes

1. **Nunca misture** chaves de teste com IDs de produção (ou vice-versa)
2. **Webhook URL é a mesma** para sandbox e produção - apenas o secret muda
3. **Mantenha uma cópia** dos valores de sandbox para rollback fácil
4. **Teste com valor pequeno** antes de divulgar publicamente

