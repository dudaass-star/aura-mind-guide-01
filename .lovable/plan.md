

# Auditoria Completa do Sistema AURA

## Estado Geral: Funcional com problemas pontuais

---

## 1. MEDITACOES - OK com ressalvas

**Catalogo**: 6 categorias ativas (ansiedade, estresse, foco, gratidao, respiracao, sono) - todas com audio gravado e URL publica funcionando.

**Catalogo Dinamico**: Codigo implementado corretamente (linhas 3059-3088). Busca do banco, agrupa por categoria, injeta no prompt. Fallback por keywords tambem implementado (linhas 4511-4554).

**Problema**: Nenhum log recente com "Meditation catalog loaded" -- o aura-agent so recebeu requests "Unauthorized" nos ultimos dias. Isso significa que o deploy do catalogo dinamico ainda NAO foi testado em producao com uma conversa real. A proxima conversa real sera o primeiro teste.

**Acao necessaria**: Nenhuma. O codigo esta correto, sera validado na proxima interacao.

---

## 2. JORNADAS - OK

- 8 jornadas ativas, cada uma com 8 episodios completos
- Chain correta: j1 → j2-autoconfianca → j2-procrastinacao → j4 → j5 → j6 → j7 → j8 → j1
- Conteudo sendo entregue corretamente (ultimo envio: 27/02, hoje)
- Rodrigo esta no ep 5 de j1-ansiedade, demais na j2-autoconfianca em episodios variados

**Problema encontrado**: 3 usuarios ativos SEM jornada atribuida:
- **Dais Palagi** (direcao) - current_journey_id = NULL
- **Lucas** (direcao) - current_journey_id = NULL
- **Richard** (mensal) - current_journey_id = NULL

Esses usuarios NAO recebem conteudo de jornada. Precisam ter uma jornada atribuida.

---

## 3. SESSOES - Atenção

- Clara tem sessao agendada hoje (27/02 23:30 UTC = 20:30 BRT) - status "scheduled", session-reminder rodando normalmente
- Maioria dos usuarios com plano direcao (4 sessoes/mes) usou 0 sessoes em fevereiro. Apenas Clara usou 2 e Lucas usou 1.

**Problema**: **Dais Palagi** e **Luciana** tem `needs_schedule_setup = true` mas o sistema de lembrete (`schedule-setup-reminder`) deveria estar cobrando. Luciana tem `preferred_session_time = "quartas 20h"` mas `needs_schedule_setup = true` -- inconsistencia.

---

## 4. FOLLOW-UPS - Problema Sério

**7 usuarios com followup_count = 99**: Dimas, Eduardo, Leticia, Lucas, Richard, Rodrigo, Camila. O valor 99 parece ser um flag para "desativar followups" mas:
- Eduardo mandou mensagem ha 5 dias e nao recebe followup
- Dimas mandou mensagem ha 3 dias e nao recebe followup
- Rodrigo esta ativo e recebendo jornada mas nao recebe followup

**Isso significa que mais da metade dos usuarios ativos NAO recebe follow-up**. O sistema de follow-up esta efetivamente desligado para eles.

**Causa provavel**: O codigo do `conversation-followup` define `followup_count = 99` quando atinge o maximo de followups. Mas nao reseta quando o usuario envia nova mensagem.

---

## 5. CONTEUDO PERIODICO - OK

Ultimo envio: 27/02 (hoje, terca-feira). 9 usuarios receberam conteudo de jornada. Funcionando conforme cronograma (tercas e sextas).

---

## 6. AUTOMACOES AGENDADAS - Funcionando

- `session-reminder`: Rodando a cada 5 min, logs limpos
- `conversation-followup`: Rodando, mas encontrando 3 usuarios e pulando todos (max followups reached)
- `periodic-content`: Rodou hoje com sucesso

---

## 7. INSTANCIAS WHATSAPP - OK

Todos os 12 usuarios na mesma instancia "Aura #1". Anti-burst por instancia implementado mas so sera relevante quando houver multiplas instancias.

---

## Resumo de Problemas a Corrigir

### Critico
1. **Follow-up desligado para 7 usuarios**: `followup_count = 99` nao reseta quando usuario envia nova mensagem. Precisa de um reset no `webhook-zapi` quando uma nova mensagem do usuario chega.

### Importante
2. **3 usuarios sem jornada**: Dais Palagi, Lucas e Richard precisam de `current_journey_id` atribuido (sugestao: j1-ansiedade como default).

### Menor
3. **Luciana**: Tem `preferred_session_time` mas `needs_schedule_setup = true` -- deveria ser false ja que ja tem preferencia configurada.
4. **Catalogo dinamico nao testado em producao**: Sera testado na proxima conversa real.

---

## Plano de Correcoes

### Correcao 1: Reset followup_count no webhook-zapi
No `webhook-zapi/index.ts`, apos salvar mensagem do usuario, resetar o followup_count:

```typescript
await supabase
  .from('conversation_followups')
  .update({ followup_count: 0, last_user_message_at: new Date().toISOString() })
  .eq('user_id', userId);
```

### Correcao 2: Atribuir jornada aos 3 usuarios via SQL
```sql
UPDATE profiles SET current_journey_id = 'j1-ansiedade', current_episode = 0
WHERE user_id IN (SELECT user_id FROM profiles WHERE name IN ('Dais Palagi', 'Lucas', 'Richard') AND current_journey_id IS NULL);
```

### Correcao 3: Corrigir Luciana
```sql
UPDATE profiles SET needs_schedule_setup = false WHERE name = 'Luciana';
```

