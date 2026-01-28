

# Plano: Ajustar Velocidade da Voz nas Meditações

## Problema

A voz está muito lenta com `speakingRate: 0.90`. O usuário confirmou que em 1.25x a velocidade ficou adequada.

## Solução

Alterar o `speakingRate` de **0.90** para **1.12** no arquivo `supabase/functions/generate-chunk/index.ts`:

```typescript
// Linha 14 - ANTES
speakingRate: 0.90,

// DEPOIS
speakingRate: 1.12,
```

## Cálculo

- Velocidade atual: 0.90
- Fator de correção do usuário: 1.25x
- Nova velocidade: 0.90 × 1.25 = **1.125** (arredondado para 1.12)

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/generate-chunk/index.ts` | Alterar `speakingRate` de 0.90 para 1.12 |

## Observação

As meditações já geradas continuarão com a velocidade antiga. Apenas novas gerações usarão a velocidade corrigida. Se quiser, pode regenerar as meditações existentes depois.

