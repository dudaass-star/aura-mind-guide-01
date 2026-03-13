

## Correção: Busca de telefone no cancel-subscription

### Problema confirmado
A última implementação adicionou `getPhoneVariations` ao `cancel-subscription`, mas o bug persiste porque:

1. **Linha 49-52**: O código força `phoneClean = "55" + phoneClean` antes de chamar `getPhoneVariations`
2. **`getPhoneVariations`**: Para input de 13 dígitos começando com `55`, só gera a versão sem nono dígito -- nunca remove o `55`

Resultado: para o telefone do Roberto (`19998849238` no Stripe), as variações geradas são `[5519998849238, 551998849238]` -- nenhuma bate.

### Correção (2 alterações)

**Arquivo 1: `supabase/functions/_shared/zapi-client.ts`**
- Na função `getPhoneVariations`, adicionar lógica para números com 12-13 dígitos que começam com `55`: gerar variações **sem** o prefixo `55`
- Para `5519998849238` → adicionar `19998849238` e `1998849238`
- Para `551998849238` → adicionar `1998849238` e `19998849238`

**Arquivo 2: `supabase/functions/cancel-subscription/index.ts`**
- Remover a adição forçada do `55` (linhas 49-52), pois `getPhoneVariations` já lida com todas as variações
- Ou manter o `55` mas também gerar variações do telefone **original** (sem o `55` forçado)

A abordagem mais robusta: alterar `getPhoneVariations` para sempre incluir a versão sem código de país quando o input começa com `55`. Isso corrige o `cancel-subscription` e qualquer outra função que use a mesma lógica.

