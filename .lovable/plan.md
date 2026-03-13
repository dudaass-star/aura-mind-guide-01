# Sistema de Orçamento Mensal de Áudio ✅ Implementado

## Resumo
Sistema de orçamento mensal de áudio por plano, com estimativa de duração por caracteres.

### Orçamentos
- Essencial: 30 min (1800s)
- Direção: 50 min (3000s)
- Transformação: 120 min (7200s)

### O que foi implementado

1. **Migração SQL** ✅ — Colunas `audio_seconds_used_this_month` e `audio_reset_date` em `profiles`
2. **`allowAudioThisTurn` expandido** ✅ — Aceita `[MODO_AUDIO]` da IA se tem orçamento disponível
3. **Contador pós-envio** ✅ — Estima duração com `Math.ceil(texto.length / 15)` e incrementa no perfil
4. **Reset inline** ✅ — Se o mês mudou, reseta antes de verificar orçamento
5. **Auto-inject `[AGUARDANDO_RESPOSTA]`** ✅ — Se resposta contém `?` sem tag de status
6. **Reset mensal** ✅ — `monthly-schedule-renewal` zera o contador no dia 1

### Regras de prioridade
- Crise: sempre permite áudio (ignora orçamento)
- Usuário pediu: sempre permite
- Abertura de sessão: obrigatório (primeiras 2 mensagens)
- Encerramento de sessão: permite
- IA decidiu (`[MODO_AUDIO]`): permite SE tem orçamento
