

## Diagnostico e Correcao: Lucas nao recebe respostas

### Problema 1 (URGENTE): Perfis duplicados causam erro no webhook-zapi

Existem **dois perfis de teste** no banco para variacoes do mesmo telefone:

| Perfil | Telefone | Nome | Status |
|--------|----------|------|--------|
| 1 | 554688139520 (sem nono digito) | Teste QA | trial |
| 2 | 5546988139520 (com nono digito) | teste | trial |

O webhook-zapi busca o perfil usando `.in('phone', phoneVariations).maybeSingle()`. Quando o Lucas manda mensagem, o sistema gera as variacoes `554688139520` e `5546988139520` e encontra **dois resultados**. O `.maybeSingle()` retorna um **ERRO** quando ha mais de um resultado. O codigo trata qualquer erro como "user not found" e ignora a mensagem silenciosamente.

Esse e o motivo direto de o Lucas nao receber resposta.

### Problema 2 (ESTRUTURAL): Stripe webhook nao esta funcionando

O `stripe-webhook` tem **zero logs**. O pagamento do Lucas foi em 6 de fevereiro (confirmado pelo screenshot do Stripe), mas nenhum perfil foi criado automaticamente. Isso significa que:
- O webhook do Stripe nao esta chamando nosso endpoint, OU
- O URL do webhook esta incorreto no painel do Stripe, OU
- O `STRIPE_WEBHOOK_SECRET` nao corresponde ao configurado no Stripe

Isso explica por que nenhum usuario pagante novo aparece desde janeiro.

### Correcoes Planejadas

#### 1. Correcao de dados (manual)

Deletar os dois perfis de teste e criar um perfil correto para o Lucas:

```text
DELETE: perfil "Teste QA" (phone: 554688139520)
DELETE: perfil "teste" (phone: 5546988139520)

INSERT: perfil para Lucas
  - name: Lucas
  - phone: 554688139520
  - email: lucas_beninca@outlook.com
  - plan: direcao
  - status: active
  - sessions_used_this_month: 0
  - sessions_reset_date: hoje
  - needs_schedule_setup: true
```

#### 2. Correcao no webhook-zapi: evitar erro com duplicatas

Alterar o trecho de busca de perfil em `webhook-zapi/index.ts` para:
- Usar `.limit(1)` em vez de `.maybeSingle()` para evitar o erro quando ha perfis duplicados
- Logar o erro real quando ocorrer (hoje ele loga "user not found" genericamente)
- Preferir o perfil com status ativo se houver duplicatas

```text
// ANTES (quebra com duplicatas):
.in('phone', phoneVariations).maybeSingle()

// DEPOIS (resiliente a duplicatas):
.in('phone', phoneVariations)
.order('updated_at', { ascending: false })
.limit(1)
// + tratar .data como array e pegar o primeiro
```

#### 3. Enviar mensagem de boas-vindas para o Lucas

Apos criar o perfil, enviar a mensagem de boas-vindas do plano Direcao via `send-zapi-message`, pois o stripe-webhook nunca enviou.

#### 4. Verificar configuracao do Stripe webhook

Verificar nos logs do Stripe analytics se o endpoint esta sendo chamado. O STRIPE_WEBHOOK_SECRET ja esta configurado como secret, mas pode estar com valor incorreto ou o URL do webhook pode nao estar apontando para o endpoint correto da Lovable Cloud.

### Resumo de arquivos modificados

1. **supabase/functions/webhook-zapi/index.ts** - Corrigir busca de perfil para ser resiliente a duplicatas
2. **Dados no banco** - Deletar perfis de teste, criar perfil do Lucas

