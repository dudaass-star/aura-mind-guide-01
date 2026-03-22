

# Reduzir TTL do Cache Gemini de 3600s → 600s

## O que muda

Duas linhas no arquivo `supabase/functions/aura-agent/index.ts`:

1. **Linha 192**: `ttl: '3600s'` → `ttl: '600s'`
2. **Linha 231**: `Date.now() + 3600 * 1000` → `Date.now() + 600 * 1000`

## Impacto esperado

- Custo de armazenamento de cache cai ~83% (de ~R$120 para ~R$20/mês)
- 10 minutos é suficiente para cobrir sequências rápidas de mensagens
- Se o usuário voltar depois de 10min, um novo cache é criado sob demanda

## Arquivos editados
- `supabase/functions/aura-agent/index.ts` (2 linhas)

