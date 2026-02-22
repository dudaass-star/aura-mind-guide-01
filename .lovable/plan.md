
# Pausa Flexivel de Sessoes com Tag [PAUSAR_SESSOES]

## Resumo

Adicionar a capacidade da AURA pausar sessoes quando o usuario pedir, com data de retomada dinamica. Hoje, quando o usuario diz "sem sessoes esse mes", a AURA concorda verbalmente mas a flag `needs_schedule_setup` continua ativa, causando insistencia nas proximas conversas.

## Mudancas

### 1. Migracao SQL
- Adicionar coluna `sessions_paused_until` (DATE, nullable) na tabela `profiles`
- Corrigir perfil do Eduardo Santos: setar `needs_schedule_setup = false`

### 2. aura-agent/index.ts

**Prompt (instrucoes da tag):**
Adicionar bloco de instrucoes para a tag `[PAUSAR_SESSOES data="YYYY-MM-DD"]` no prompt do sistema, ensinando a AURA a:
- Calcular a data de retomada baseado no que o usuario disser ("daqui a 3 dias", "semana que vem", "so no proximo mes", "depois do dia 10")
- Usar a data atual do contexto temporal para o calculo
- Confirmar com o usuario: "Te procuro no dia X pra gente organizar, tudo bem?"

**Condicional do bloco de agenda (linha ~3329):**
Alterar a condicao para verificar se a pausa esta ativa:
```
if (profile?.needs_schedule_setup && planConfig.sessions > 0 && !isSessionsPaused)
```
Onde `isSessionsPaused` = `sessions_paused_until` existe e esta no futuro.

**Processamento da tag (pos-resposta):**
- Detectar `[PAUSAR_SESSOES data="YYYY-MM-DD"]` na resposta da IA
- Validar a data (nao no passado, maximo 90 dias no futuro)
- Atualizar o perfil: `needs_schedule_setup = false` e `sessions_paused_until = data`

**Limpeza da tag:**
- Adicionar regex de remocao em ambas as funcoes de limpeza (formatMessagesForAPI e splitIntoMessages)

### 3. schedule-setup-reminder/index.ts

- Adicionar filtro `.or('sessions_paused_until.is.null,sessions_paused_until.lt.{hoje}')` nas queries de busca de usuarios
- Adicionar logica de reativacao: buscar usuarios cuja `sessions_paused_until` ja passou, setar `needs_schedule_setup = true` e limpar `sessions_paused_until`

### 4. monthly-schedule-renewal/index.ts

- No reset mensal, limpar `sessions_paused_until` para todos os usuarios (o novo mes reseta tudo)
- Manter comportamento atual de setar `needs_schedule_setup = true`

## Fluxo esperado

```text
Usuario: "Sem sessoes esse mes"
  |
  v
AURA: "Entendi! Te procuro em 01/03 pra organizar. Combinado?"
  + [PAUSAR_SESSOES data="2026-03-01"]
  |
  v
Backend: needs_schedule_setup = false
         sessions_paused_until = 2026-03-01
  |
  v
schedule-setup-reminder: ignora usuario (pausa ativa)
  |
  v
01/03: monthly-schedule-renewal limpa pausa, reativa needs_schedule_setup
  |
  v
AURA volta a oferecer agendamento naturalmente
```

```text
Usuario: "Daqui a 3 dias a gente marca"
  |
  v
AURA: "Combinado! Dia 25/02 te procuro. Ate la!"
  + [PAUSAR_SESSOES data="2026-02-25"]
  |
  v
Backend: needs_schedule_setup = false
         sessions_paused_until = 2026-02-25
  |
  v
25/02: schedule-setup-reminder detecta pausa expirada
       -> reativa needs_schedule_setup = true
       -> limpa sessions_paused_until
  |
  v
Proxima conversa: AURA oferece agendamento
```

## Detalhes tecnicos

| Arquivo | Tipo de mudanca |
|---------|----------------|
| Migracao SQL | ALTER TABLE profiles ADD COLUMN sessions_paused_until DATE; UPDATE perfil Eduardo |
| aura-agent/index.ts | Prompt + condicional agenda + parsing tag + limpeza tag (4 pontos de alteracao) |
| schedule-setup-reminder/index.ts | Filtro de pausa + logica de reativacao automatica |
| monthly-schedule-renewal/index.ts | Limpar sessions_paused_until no reset mensal |
