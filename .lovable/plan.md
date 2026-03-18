

## Investigação: Cache Explícito do Gemini via Edge Function

### Resultado: **NÃO é viável** para o caso da Aura

### O Problema

O cache explícito do Gemini (via `cachedContents` API) tem um **requisito mínimo de 32.768 tokens** de conteúdo cacheável. O prompt estático da Aura (`AURA_STATIC_INSTRUCTIONS`) tem **~14.000 tokens** — menos da metade do mínimo exigido.

Se tentarmos criar um cache com esse conteúdo, a API retorna:
```
[400 Bad Request] Cached content is too small. 
total_token_count=14000, min_total_token_count=32768
```

### Opções analisadas

| Opção | Viável? | Por quê |
|-------|---------|---------|
| Cache explícito via REST API | **Não** | Prompt de 14k tokens < mínimo de 32k |
| Inflar o prompt para 33k+ | **Não** | Aumenta custo e degrada qualidade |
| Cache implícito (já ativo) | **Sim** | Gemini aplica automaticamente para prefixos idênticos, desconto de ~75% no input |
| Chamar Gemini direto (sem Gateway) | **Possível** | Já temos `GEMINI_API_KEY`, mas não resolve o cache — apenas dá visibilidade no `cachedContentTokenCount` |

### Conclusão

O sistema atual já está na configuração ideal para o tamanho do prompt:
- **Cache implícito do Gemini** é aplicado automaticamente quando o prefixo é idêntico entre chamadas
- O desconto de ~75% acontece na cobrança mesmo sem ser reportado na resposta
- O prompt de 14k tokens é pequeno demais para cache explícito

### O que realmente reduziria custos

1. **Reduzir o contexto dinâmico** — o `dynamicContext` com histórico de 40 mensagens é o que mais varia e não é cacheável. Reduzir para 20-25 mensagens economizaria ~3-5k tokens por chamada
2. **Usar Gemini 2.5 Flash em vez de Pro** — ~4x mais barato com qualidade similar para conversação
3. **Adicionar o log diagnóstico** (1 linha) para confirmar se o Gateway repassa `cached_tokens` e quantificar a economia real

### Recomendação

Não implementar cache explícito. Em vez disso, posso:
- Adicionar o log diagnóstico para ver o que o Gateway retorna sobre cache
- Analisar se vale reduzir o histórico de mensagens no contexto dinâmico
- Comparar custos entre os modelos nos `token_usage_logs`

