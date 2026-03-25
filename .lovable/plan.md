

# Adicionar link de cancelamento no prompt da AURA

## O que será feito

Adicionar uma instrução mínima no system prompt da AURA para que, quando o usuário pedir cancelamento, ela use o link `olaaura.com.br/cancelar`.

## Alteração

### `supabase/functions/aura-agent/index.ts` (~linha 2287, após o bloco de UPGRADE)

Adicionar apenas:

```
# CANCELAMENTO DE ASSINATURA

Quando o usuário pedir para cancelar, direcione para olaaura.com.br/cancelar
```

Sem instruções extras de tom, retenção ou regras — a AURA já está lidando bem com isso naturalmente. Só precisa saber o link certo.

