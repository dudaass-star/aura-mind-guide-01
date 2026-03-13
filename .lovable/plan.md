

# Correções Críticas — Plano de Implementação

## Arquivo: `supabase/functions/aura-agent/index.ts`

### Mudança 1: Sanitizar tags faltantes

**Problema na prática:** Tags como `[AGENDAR_TAREFA:...]`, `[MEDITACAO:...]`, `[CAPSULA_DO_TEMPO]`, etc. ficam visíveis no histórico da IA. Isso pode confundir a Aura em turnos futuros (ela tenta re-executar ações) ou pior, o usuário vê texto estranho como `[UPGRADE:essencial]` na conversa.

**O que muda:** Adicionar regex de limpeza para as 9 tags faltantes em duas funções:
- `sanitizeMessageHistory()` (~linha 1871): limpa tags do histórico antes de enviar para a IA
- `splitIntoMessages()` (~linha 1932): limpa tags da resposta antes de enviar para o usuário

Tags a adicionar em ambas:
```
[AGENDAR_TAREFA:...], [CANCELAR_TAREFA:...], [CAPSULA_DO_TEMPO], 
[MEDITACAO:...], [UPGRADE:...], [INSIGHT:...], [COMPROMISSO:...], 
[CRIAR_AGENDA:...], [REATIVAR_SESSAO]
```

### Mudança 2: Consistência em `calculateSessionTimeContext`

**Problema na prática:** Linhas 3023 e 3071 (sessões recém-iniciadas/reativadas) chamam `calculateSessionTimeContext(currentSession)` sem `lastMessageTimestamp` e `resumptionCount`. Embora sessões novas tenham gap=0 (impacto zero agora), qualquer refatoração futura pode quebrar. 

**O que muda:** Passar `null, 0` explicitamente:
```typescript
calculateSessionTimeContext(currentSession, null, 0)
```

### Mudança 3: Envio de resumo com instância correta do WhatsApp

**Problema na prática:** Na linha 4728, o resumo pós-sessão é enviado via `sendTextMessage(cleanPhone, summaryMessage)` sem a config da instância do usuário. Se o usuário está numa instância diferente da padrão (env vars), o resumo falha ou vai pela instância errada.

**O que muda:**
1. Importar `getInstanceConfigForUser` do `instance-helper.ts` (linha 3)
2. Na linha 4728, obter a config da instância antes de enviar:
```typescript
const instanceConfig = await getInstanceConfigForUser(supabase, profile.user_id);
const sendResult = await sendTextMessage(cleanPhone, summaryMessage, undefined, instanceConfig);
```

### Mudança 4: Consolidar updates duplicados de profile

**Problema na prática:** Ao iniciar sessão (linhas 3006-3019) e ao reativar sessão perdida (linhas 3054-3067), são feitos 2 UPDATEs separados na mesma tabela profiles — um para `current_session_id` e outro para `sessions_used_this_month`. Isso é ineficiente e pode causar race condition (o segundo UPDATE sobrescreve dados do primeiro se outro processo atualizar o profile entre eles).

**O que muda:** Unificar em um único UPDATE em cada bloco:
```typescript
await supabase.from('profiles').update({
  current_session_id: session.id,
  sessions_used_this_month: (profile.sessions_used_this_month || 0) + 1
}).eq('id', profile.id);
```

---

**Resumo:** 4 mudanças, todas no mesmo arquivo `aura-agent/index.ts`. Nenhuma migração de banco necessária.

