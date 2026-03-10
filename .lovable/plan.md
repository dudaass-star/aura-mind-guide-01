

# Remover "Como você está hoje?" da mensagem de upgrade

## Contexto
Na mensagem de upgrade (plano sem sessões), a frase termina com *"Vamos continuar de onde paramos? Como você está hoje?"* — mas como a AURA já está conversando com o cliente, essa pergunta é redundante.

## Alteração

**Arquivo**: `supabase/functions/stripe-webhook/index.ts` (linha 139)

Trocar:
```
Vamos continuar de onde paramos? Como você está hoje?
```

Por:
```
Vamos continuar de onde paramos?
```

Uma única linha editada.

