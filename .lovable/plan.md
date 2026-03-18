

## Análise: Mencionar os 7 dias grátis no Stripe Checkout

**Sim, faz total sentido.** É uma questão de consistência e confiança. O usuário lê "7 dias grátis" na página `/experimentar`, clica, e quando chega no Stripe vê um formulário pedindo cartão sem reforçar que não vai ser cobrado agora. Isso gera fricção e abandono.

### O que acontece hoje

- A página `/experimentar` menciona "7 dias grátis" claramente
- O `create-checkout` passa `trial_period_days: 7` — o Stripe **deveria** mostrar "7-day free trial" automaticamente, mas em `locale: "pt-BR"` a tradução pode não ser óbvia
- Não há `subscription_data.description` customizada para reforçar a mensagem

### Mudança proposta

**Arquivo:** `supabase/functions/create-checkout/index.ts`

Adicionar um `description` na `subscription_data` quando for trial, que aparece diretamente na tela do Stripe Checkout:

```typescript
sessionConfig.subscription_data = {
  description: trial 
    ? "7 dias grátis — a primeira cobrança será apenas no 8º dia." 
    : undefined,
  // ...resto
};
```

Isso faz com que o Stripe Checkout exiba essa frase claramente ao lado do preço, reforçando que o usuário não será cobrado imediatamente.

### Também vale considerar

Na própria página `/experimentar`, o botão de submit diz "Começar 7 dias grátis" e abaixo diz "Você será redirecionado para o pagamento seguro via Stripe" — isso já está bom. A mudança real é no lado do Stripe.

### Resumo

| O quê | Onde |
|-------|------|
| Adicionar `description` com mensagem de trial | `create-checkout/index.ts` na `subscription_data` |

Mudança mínima, uma linha, alto impacto na conversão.

