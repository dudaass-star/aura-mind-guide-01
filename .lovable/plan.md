

## Consciencia de agenda/sessoes server-side no aura-agent

### Problema atual
A Aura so detecta sessoes agendadas dentro de uma janela de 1 hora (para inicio imediato). Ela nao tem nenhuma visao das proximas sessoes do usuario - nao sabe quando e a proxima, quantas faltam no mes, nem consegue lembrar o usuario proativamente.

### Solucao: Injetar contexto de agenda no finalPrompt

Usar a mesma abordagem do contexto temporal: buscar as sessoes futuras do usuario no banco e injetar um bloco deterministico no prompt com dados concretos.

### Detalhes tecnicos

**Arquivo:** `supabase/functions/aura-agent/index.ts`

**Mudanca 1 - Buscar proximas sessoes agendadas (apos a busca de sessoes existente, ~linha 2344)**

Adicionar uma query que busca as proximas sessoes futuras do usuario (status `scheduled`, `scheduled_at > now()`), limitada a 5 resultados:

```typescript
let upcomingSessions: any[] = [];
if (profile?.user_id) {
  const { data: upcoming } = await supabase
    .from('sessions')
    .select('id, scheduled_at, session_type, focus_topic')
    .eq('user_id', profile.user_id)
    .eq('status', 'scheduled')
    .gt('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(5);

  if (upcoming && upcoming.length > 0) {
    upcomingSessions = upcoming;
  }
}
```

**Mudanca 2 - Injetar contexto de agenda no finalPrompt (junto ao bloco temporal, ~linha 3158)**

Adicionar um bloco que informa a Aura sobre a agenda do usuario:

```typescript
if (upcomingSessions.length > 0) {
  const nextSession = upcomingSessions[0];
  const nextDate = new Date(nextSession.scheduled_at);
  const hoursUntilNext = (nextDate.getTime() - Date.now()) / (1000 * 60 * 60);
  
  // Formatar data/hora em pt-BR (horario de Brasilia)
  const dateStr = nextDate.toLocaleDateString('pt-BR', { 
    weekday: 'long', day: 'numeric', month: 'long', 
    timeZone: 'America/Sao_Paulo' 
  });
  const timeStr = nextDate.toLocaleTimeString('pt-BR', { 
    hour: '2-digit', minute: '2-digit', 
    timeZone: 'America/Sao_Paulo' 
  });

  let agendaBlock = `\n\n📅 AGENDA DO USUARIO (DADOS DO SISTEMA):`;
  agendaBlock += `\nProxima sessao: ${dateStr} as ${timeStr}`;
  
  if (nextSession.focus_topic) {
    agendaBlock += ` (tema: ${nextSession.focus_topic})`;
  }

  // Contexto de proximidade
  if (hoursUntilNext <= 2) {
    agendaBlock += `\n⚡ A sessao e MUITO EM BREVE (menos de 2h). 
    Se o usuario conversar, lembre gentilmente que a sessao esta proxima.`;
  } else if (hoursUntilNext <= 24) {
    agendaBlock += `\n🔔 A sessao e HOJE ou AMANHA. 
    Pode mencionar naturalmente se houver oportunidade.`;
  }

  // Listar demais sessoes se houver
  if (upcomingSessions.length > 1) {
    agendaBlock += `\nOutras sessoes agendadas:`;
    for (let i = 1; i < upcomingSessions.length; i++) {
      const s = upcomingSessions[i];
      const d = new Date(s.scheduled_at);
      const dStr = d.toLocaleDateString('pt-BR', { 
        weekday: 'short', day: 'numeric', month: 'short',
        timeZone: 'America/Sao_Paulo' 
      });
      const tStr = d.toLocaleTimeString('pt-BR', { 
        hour: '2-digit', minute: '2-digit',
        timeZone: 'America/Sao_Paulo' 
      });
      agendaBlock += `\n  - ${dStr} as ${tStr}`;
    }
  }

  // Info de sessoes restantes no mes
  const sessionsUsed = profile?.sessions_used_this_month || 0;
  const totalSessions = planConfig.sessions;
  if (totalSessions > 0) {
    const remaining = Math.max(0, totalSessions - sessionsUsed);
    agendaBlock += `\nSessoes restantes no mes: ${remaining}/${totalSessions}`;
  }

  agendaBlock += `\nREGRA: Use esses dados para contextualizar a conversa. 
  NAO invente datas ou horarios. Se o usuario perguntar sobre a agenda, 
  use EXATAMENTE esses dados.`;

  finalPrompt += agendaBlock;
  console.log(`📅 Agenda context injected: ${upcomingSessions.length} upcoming sessions, next in ${hoursUntilNext.toFixed(1)}h`);
}
```

### Por que isso resolve

- **A Aura sabe exatamente quando e a proxima sessao**: datas e horarios reais do banco, sem inventar
- **Pode lembrar o usuario naturalmente**: "a proposito, amanha temos sessao as 19h!"
- **Evita confusao de datas**: o modelo recebe dados formatados, nao precisa calcular nada
- **Contexto de proximidade**: quando a sessao e iminente, a Aura e instruida a lembrar
- **Mesmo padrao do contexto temporal**: logica server-side deterministica, zero custo/latencia extra

### Impacto
- Aura passa a ter nocao da agenda real do usuario
- Pode lembrar de sessoes proximas naturalmente na conversa
- Nunca mais inventa datas ou horarios errados
- Zero chamadas extras a API, apenas uma query SQL adicional leve
