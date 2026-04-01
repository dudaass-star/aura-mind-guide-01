

# Reconciliação: 4 clientes ativos sem perfil

## Diagnóstico

Apenas **4 clientes** têm assinatura ativa no Stripe sem perfil correspondente no banco:

| Cliente | Stripe ID | Plano | Situação |
|---|---|---|---|
| Felype Gonçalves | cus_UD2qdZvYGBomSS | essencial | Sem perfil |
| Rafaela Gomes | cus_UClcvkXNsa2pcd | direção | Sem perfil |
| Ana Luiza (nome Stripe) | cus_UCkGunlzA2sQIr | direção | Sem perfil |
| Márcia Ferraz | cus_UBe6wbdZDjIDeL | essencial | Sem perfil |

Os outros 3 clientes ativos (Camila, Nilda, Letícia) estão corretos no banco.

Há também **10 assinaturas `past_due`** — trials cujo primeiro pagamento falhou. Esses não são "ativos" e precisam de dunning (processo separado).

## Plano de ação

### 1. Criar perfis para os 4 clientes (migration SQL)

Para cada um, buscar phone/email/name dos metadados do Stripe e criar o perfil com `status = 'active'`, `plan` correto, e `converted_at = now()`.

Precisamos primeiro buscar os metadados (phone) de cada customer no Stripe para inserir corretamente.

### 2. Enviar template `aura_reconnect` para os 4

Após criar os perfis, disparar o template via a edge function existente ou criar um script ad-hoc.

### 3. Fix no `stripe-webhook` (prevenção)

Robustecer o handler de `invoice.paid` para criar perfil automaticamente quando não encontrar match, usando dados do customer + subscription metadata. Isso previne reincidência.

## Arquivos modificados

| Arquivo | Mudança |
|---|---|
| Migration SQL | INSERT dos 4 perfis faltantes |
| `supabase/functions/stripe-webhook/index.ts` | Fallback de criação de perfil no `invoice.paid` |

