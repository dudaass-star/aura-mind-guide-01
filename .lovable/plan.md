
## Diagnóstico

Verifiquei o código atual de `supabase/functions/create-checkout/index.ts` e os logs do backend. O erro atual não é mais o 3DS.

O bloqueio agora é este:
```text
You can only set `payment_method_collection` if there are recurring prices.
```

Isso bate exatamente com o código atual:
- `sessionConfig.payment_method_collection = 'always'` está sendo definido antes do `if (trial)`.
- No fluxo de trial, o checkout usa `mode = "payment"` com preço único de R$1.
- O frontend (`src/pages/Checkout.tsx`) sempre chama `create-checkout` com `trial: true`, então o usuário está sempre caindo nesse fluxo de pagamento avulso.
- Em sessões `payment` com preço único, esse parâmetro não é aceito.

## Plano

1. Ajustar `supabase/functions/create-checkout/index.ts` para parar de definir `payment_method_collection` de forma global.
2. Manter `payment_method_collection = 'always'` apenas no fluxo `mode = "subscription"` se ainda quisermos esse comportamento para assinaturas recorrentes.
3. Remover esse parâmetro dos fluxos:
   - `trial` (`mode = "payment"`)
   - `boleto` (`mode = "payment"`)
4. Preservar no trial o que já está correto:
   - `setup_future_usage: 'off_session'`
   - `request_three_d_secure: 'any'`
5. Não mexer no webhook de trial, porque ele já faz a lógica de:
   - validar cartão
   - estornar R$1
   - recuperar/anexar o método de pagamento
   - criar a assinatura com trial

## Impacto esperado

Essa correção é a menor mudança possível e resolve o erro atual do checkout sem desmontar a blindagem que foi montada.

O motivo é:
- o erro atual vem de um parâmetro incompatível com `mode="payment"`;
- o salvamento do cartão para uso futuro continua vindo de `setup_future_usage: 'off_session'`;
- o resto do fluxo de trial no webhook continua intacto.

## Arquivo a alterar

- `supabase/functions/create-checkout/index.ts`

## Detalhe técnico

Hoje a estrutura correta deve ficar conceitualmente assim:

```text
sessionConfig = base config

if trial:
  mode = payment
  NÃO definir payment_method_collection
  manter setup_future_usage + 3DS

else if boleto:
  mode = payment
  NÃO definir payment_method_collection

else:
  mode = subscription
  pode definir payment_method_collection = 'always'
```

## Observação adicional

Também confirmei pelos logs que os erros anteriores foram resolvidos:
- `mandate_options` inválido
- `request_three_d_secure: 'always'` inválido

O único erro persistente agora é mesmo o `payment_method_collection` aplicado ao trial.
