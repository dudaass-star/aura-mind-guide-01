

# Plano: Atualizar `anthropic-version` + Log de diagnóstico

## Problema
O header `anthropic-version: 2023-06-01` é de 2 anos atrás e provavelmente não suporta `claude-sonnet-4-6` (modelo de 2025). Isso causa o erro 400 enganoso.

## Alterações em `supabase/functions/aura-agent/index.ts`

1. **Linha 132**: Atualizar `'anthropic-version': '2023-06-01'` → `'anthropic-version': '2025-01-01'`
2. **Antes da linha 128**: Adicionar log dos primeiros 12 caracteres da key para confirmar nos logs qual chave está ativa:
   ```
   console.log('🔑 ANTHROPIC_API_KEY prefix:', ANTHROPIC_API_KEY.substring(0, 12) + '...');
   ```

**Sem fallback** — se der erro, o erro aparece nos logs para diagnóstico. A troca de modelo continua sendo feita manualmente pelo admin em `/admin/configuracoes`.

