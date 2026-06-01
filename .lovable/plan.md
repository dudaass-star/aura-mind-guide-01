## Causa raiz (confirmada nos logs)

Log do `aura-agent` no momento do pedido do Eduardo (01/06 13:19):
```
🧘 Meditation tag detected: [MEDITACAO:ansiedade]
🧘 send-meditation error: ReferenceError: userPhone is not defined
```

A Aura **emitiu a tag corretamente** (o fix anterior do prompt funcionou). O bug está no handler que processa a tag: ele referencia uma variável `userPhone` que **nunca foi declarada** no arquivo `aura-agent/index.ts`.

O `req.json()` (linha 4216) desestrutura `phone` (não `userPhone`). O `send-meditation` chega a ser invocado, mas a montagem do body lança `ReferenceError` antes do `fetch`, o `try/catch` captura, loga o erro, e nenhum áudio é enviado. Por isso `send-meditation` não tem nenhum log de execução.

Mesmo bug afeta o fallback "Aura prometeu sem tag" que adicionamos na rodada anterior — também usa `userPhone`.

## Fix (cirúrgico, 4 substituições em 1 arquivo)

Em `supabase/functions/aura-agent/index.ts`, trocar `userPhone` por `(phone || profile?.phone)` nas 4 ocorrências:

- **Linha 7517** (guard do handler principal): `if (meditationMatch && (profile?.user_id || userPhone))` → `if (meditationMatch && (profile?.user_id || phone || profile?.phone))`
- **Linha 7563** (body do `send-meditation` no handler principal): `phone: userPhone` → `phone: phone || profile?.phone`
- **Linha 7762** (guard do fallback): mesma troca do 7517
- **Linha 7818** (body do `send-meditation` no fallback): mesma troca do 7563

Nada mais muda. `send-meditation` já aceita `user_id` OU `phone` e resolve um a partir do outro, então passar `profile?.phone` como fallback é seguro.

## Deploy + validação

1. Editar `aura-agent/index.ts` (4 trocas).
2. `supabase--deploy_edge_functions(["aura-agent"])` para garantir publicação (memória de drift Lovable→GH Actions).
3. Validar em ≤10 min:
   - `select created_at, left(error,200) from failed_message_log where created_at > now() - interval '10 minutes' order by created_at desc;` → sem novos erros.
   - Logs do `aura-agent`: próxima `🧘 Meditation tag detected` deve ser seguida de `🧘 send-meditation response: 200`.
   - `select * from user_meditation_history order by sent_at desc limit 3;` recebendo linha nova.
4. Reenviar a meditação de ansiedade pro Eduardo manualmente (invocar `send-meditation` com `category: 'ansiedade'` e `user_id` dele) pra fechar o caso aberto.

## Fora de escopo

- Prompt da Aura (já corrigido na rodada anterior e funcionando — tag foi emitida).
- `send-meditation`, catálogo, RLS, schema.
- Refatorar para renomear `phone` → `userPhone` no resto do arquivo (mudança maior, fora do necessário).

Confirma que vou em frente com o fix + reenvio manual pro Eduardo?
