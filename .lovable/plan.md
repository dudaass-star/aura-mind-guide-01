
## Corrigir: AURA não responde o Rodrigo (número internacional)

### Diagnóstico

O Rodrigo está ativo no banco com telefone `64279241473` (Nova Zelândia). Porém, quando ele manda mensagem no WhatsApp, o sistema não o encontra.

**Causa raiz:** A função `getPhoneVariations` em `supabase/functions/_shared/zapi-client.ts` assume que TODO número é brasileiro. Quando recebe `64279241473` (11 dígitos), adiciona "55" na frente, gerando `5564279241473` -- que não existe no banco.

### Correção

**Arquivo:** `supabase/functions/_shared/zapi-client.ts`

Alterar `getPhoneVariations` para:

1. **Sempre incluir o número original** como primeira variação (sem modificação)
2. **Só aplicar lógica brasileira** (adicionar "55", manipular o dígito 9) quando o número tiver 10-11 dígitos E não for claramente internacional
3. Manter compatibilidade total com números brasileiros existentes

A lógica atualizada:

```text
Entrada: 64279241473
Saída: ['64279241473']  -- sem adicionar 55, número internacional

Entrada: 51996219341 (11 dígitos BR)
Saída: ['5551996219341', '555196219341']  -- mantém comportamento atual

Entrada: 5551996219341 (13 dígitos, já com 55)
Saída: ['5551996219341', '555196219341']  -- mantém comportamento atual
```

### Resultado esperado

- Rodrigo será encontrado pelo número `64279241473` e a AURA vai responder normalmente
- Todos os usuários brasileiros continuam funcionando como antes
- Futuros números internacionais também funcionarão sem intervenção manual
