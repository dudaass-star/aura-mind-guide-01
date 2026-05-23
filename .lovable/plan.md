## Problema
O texto atual do bloco "Pix Automático" no checkout V2 é sugestivo e explica demais o benefício ("assim as próximas cobranças entram sozinhas..."). Isso cria espaço mental para o cliente questionar se quer ou não fazer.

## Mudança
Substituir o card verde atual (linhas 1140-1151 de `src/pages/CheckoutV2.tsx`) por um card âmbar com tom imperativo e sem justificativas:

- **Título:** "⚠️ Ação obrigatória no app do banco"
- **Corpo:** "Ao confirmar o pagamento, **marque 'Autorizar Pix Automático'**. Sem isso, a assinatura não será ativada."
- **Sem** frases do tipo "assim você...", "desse jeito...", "para não ter que..."
- Visual: fundo âmbar (`hsl(35_70%_60%)/15`) com borda mais forte para destacar urgência.

## Arquivo afetado
- `src/pages/CheckoutV2.tsx` (linhas 1140-1151)

## Fora de escopo
- Sem alteração no fluxo de pagamento, backend, ou outros componentes.