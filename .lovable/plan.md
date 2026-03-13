# Correções Críticas — Implementadas ✅

## O que foi corrigido

### 1. Sanitização de tags faltantes ✅
Adicionadas 9 regex em `sanitizeMessageHistory()` e `splitIntoMessages()`:
`[AGENDAR_TAREFA]`, `[CANCELAR_TAREFA]`, `[CAPSULA_DO_TEMPO]`, `[MEDITACAO]`, `[UPGRADE]`, `[INSIGHT]`, `[COMPROMISSO]`, `[CRIAR_AGENDA]`, `[REATIVAR_SESSAO]`

### 2. Consistência em `calculateSessionTimeContext` ✅
Passados `null, 0` explicitamente nos 2 locais de início/reativação de sessão.

### 3. Envio de resumo com instância correta ✅
Importado `getInstanceConfigForUser` e usado antes de `sendTextMessage` no envio de resumo pós-sessão.

### 4. Updates duplicados de profile consolidados ✅
Unificados 2 UPDATEs em 1 nos blocos de início de sessão e reativação de sessão perdida.
