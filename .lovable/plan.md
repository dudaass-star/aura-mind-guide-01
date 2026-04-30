## Bug confirmado: shift de timezone fabricado quebra lembretes relativos

### Evidência (logs do aura-agent às 12:01 BRT / 15:01 UTC)

```
INFO  🤖 Extracted actions: {"schedule_reminder":{"description":"uma panela no fogo","datetime_text":"agora em 3 minutos"}, ...}
WARN  ⚠️ [MICRO-AGENT] Reminder com datetime no passado, ignorado: 2026-04-30T12:04:12.246Z
```

O extractor funcionou. O parser entendeu "em 3 minutos". Mas o resultado saiu como `12:04 UTC` (= 09:04 BRT, três horas no passado), e a guarda anti-passado descartou a task. Zero linhas em `scheduled_tasks` para o usuário.

### Causa-raiz (aura-agent/index.ts linhas 1327-1329)

```ts
const saoPauloOffset = -3 * 60;
const utcMinutes = new Date().getTimezoneOffset();
const now = new Date(Date.now() + (utcMinutes + saoPauloOffset) * 60 * 1000);
const parsed = parseDateTimeFromText(actions.schedule_reminder.datetime_text, now);
```

Isso fabrica um objeto `Date` que mente sobre o instante real: pega o UTC atual e subtrai 3h, criando um Date cujo `.getTime()` aponta para 3h no passado. Então:

- Real: `Date.now()` = 15:01 UTC
- `now` falso: 12:01 UTC
- Parser relativo: `now.getTime() + 3min` = 12:04 UTC (`.toISOString()` = `12:04Z`)
- Comparação `parsed <= new Date()`: 12:04Z ≤ 15:01Z → **passado → descartado**

A "compensação de timezone" só faria sentido se o parser estivesse interpretando hora absoluta de wall clock (ex: "amanhã 22h" significa 22h BRT = 01h UTC do dia seguinte). Mesmo aí, a abordagem correta é manter `now` em UTC real e converter as horas absolutas para UTC no momento do `setHours`. Para parsing relativo (`+N minutos/horas/dias`), timezone é totalmente irrelevante — `Date.now() + delta` já é o instante absoluto correto em qualquer fuso.

### Correção

**Arquivo: `supabase/functions/aura-agent/index.ts`**

1. **Remover o shift falso** nas linhas 1327-1329. Usar `new Date()` real:
   ```ts
   const now = new Date();
   const parsed = parseDateTimeFromText(actions.schedule_reminder.datetime_text, now);
   ```

2. **Corrigir `parseDateTimeFromText` (linhas 620-673) para parsing absoluto BRT-aware**: quando o usuário diz "amanhã 22h", `setHours(22)` está chamando em horário local do servidor (UTC). Como o servidor roda em UTC, `setHours(22, 0)` cria 22:00 UTC = 19:00 BRT — errado. Solução: para parsing absoluto, calcular o offset BRT manualmente:
   ```ts
   // Em vez de targetDate.setHours(hour, minute, 0, 0):
   // Construir a data alvo em UTC adicionando 3h ao horário pretendido em BRT
   targetDate.setUTCHours(hour + 3, minute, 0, 0);
   ```
   (Tratando wraparound de dia se `hour + 3 >= 24`.)

   Para parsing relativo (linhas 587-618), nada muda — `Date.now() + delta` já está correto.

3. **Reduzir margem da guarda "passado"** (linha 1334): `parsed <= new Date()` é exato demais para microsegundos. Permitir até 30s de slop:
   ```ts
   } else if (parsed.getTime() <= Date.now() - 30_000) {
   ```
   Não é o bug atual, mas previne edge case de processamento lento async (extractor leva 1-2s) deixar lembretes "em 1 minuto" como passado.

4. **Log mais informativo** quando ignorar passado: incluir `now.toISOString()` e `datetime_text` original para diagnóstico:
   ```ts
   console.warn('⚠️ [MICRO-AGENT] Reminder no passado, ignorado:', { 
     parsed: parsed.toISOString(), 
     now: new Date().toISOString(), 
     text: actions.schedule_reminder.datetime_text 
   });
   ```

### Validação

- Após deploy, testar via WhatsApp: "me lembra em 2 minutos de X". Verificar que aparece linha `✅ [MICRO-AGENT] Reminder scheduled: <iso>` nos logs e `scheduled_tasks` recebe a row com `execute_at` correto.
- Testar também absoluto: "me lembra amanhã às 9h". Verificar que `execute_at` ISO corresponde a 9h BRT (= 12h UTC) do dia seguinte.

### Memória a atualizar

Atualizar `mem://features/agendamento-tarefas-sistema` com a regra: **timezone é irrelevante para parsing relativo; para absoluto, usar `setUTCHours(hour + 3, ...)` em vez de fabricar objetos Date com offset shifted**. Marcar como bug histórico o anti-padrão de `new Date(Date.now() + offset*60*1000)`.

### Fora de escopo

- Não recriar manualmente o lembrete da panela (já passou).
- Não tocar no Bug 2 do plano anterior (cron weekly-report) — independente.