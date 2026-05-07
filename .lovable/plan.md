# Convite D0 à 1ª sessão para todos os planos

## Problema confirmado

O convite à 1ª sessão pós-WELCOME só funciona para Essencial. Para Direção e Transformação, ele é silenciosamente atropelado pelo prompt de "configurar agenda mensal", porque ambos os blocos disparam na mesma resposta. Resultado: 7 usuários Direção criados nas últimas 48h, 0 sessões D0 iniciadas. Apenas Fabiana (Essencial) teve sessão.

## Causa raiz

Em `supabase/functions/aura-agent/index.ts`:
- Linha 5748 — injeta CONVITE D0 (1ª sessão, tema livre, agora)
- Linha 5865 — injeta CONFIGURAÇÃO DE AGENDA MENSAL (4/8 sessões da semana)

Quando o usuário tem plano Direção/Transformação e a flag `pending_first_session_invite=true`, os DOIS blocos são injetados no mesmo prompt. A Aura segue o fluxo mensal porque ele é mais detalhado e termina não emitindo `[AGENDAR_SESSAO:...]` para a sessão D0.

## Mudanças

### 1. Prioridade dura no aura-agent (linha ~5865)
Pular o bloco de `needs_schedule_setup` enquanto `pending_first_session_invite=true`. A configuração mensal só entra DEPOIS que a 1ª sessão D0 foi agendada/concluída.

```ts
if (profile?.needs_schedule_setup 
    && planConfig.sessions > 0 
    && !isSessionsPaused
    && !profile?.pending_first_session_invite) {  // <- adiciona guarda
```

### 2. Reforçar obrigatoriedade da tag no convite D0 (linha ~5768)
Hoje o prompt diz "emita ao final" — vou tornar imperativo, com exemplo concreto, alinhado ao contrato em `mem://features/sessions/scheduling-tag-contract`:

- "OBRIGATÓRIO: se o usuário aceitar (qualquer sinal de sim, 'bora', 'vamos'), a resposta DEVE terminar com `[AGENDAR_SESSAO:YYYY-MM-DD HH:MM]`. Sem essa tag, a sessão NÃO é criada e você quebra a promessa."
- Adicionar exemplo de turno completo mostrando a tag no fim.

### 3. Recuperar os 7 usuários Direção que ficaram sem sessão D0
Re-armar `pending_first_session_invite=true` apenas para os 7 usuários Direção das últimas 48h que: (a) ainda não têm nenhuma sessão criada, (b) `status='trial'`, (c) ainda estão dentro do trial de 7 dias. Na próxima mensagem deles, o convite D0 dispara naturalmente.

Lista atual:
- Aline Kosuzinski, Danubia Santos, Nagirley Araújo, Adriana Paula, Alexandre Pardossi, Silvia Cristina, Marilene Alves

Observação: Adriana e Alexandre já estão em conversa avançada sobre agenda mensal — para esses dois, sugiro NÃO re-armar (seria redundante/confuso). Vou re-armar só os 5 que mal conversaram.

## Arquivos afetados

- `supabase/functions/aura-agent/index.ts` — guarda em ~5865 + reforço de prompt em ~5768
- Ação manual: UPDATE em `profiles` para os 5 usuários elegíveis

## Validação

- Logs: buscar `🎯 Injetando convite à 1ª sessão (D0)` na próxima interação dos usuários re-armados
- DB: contar sessões criadas em D0 (criadas dentro de 24h do `trial_started_at`) vs total de novos trials por plano
- Não deve haver `# 📅 CONFIGURAÇÃO DE AGENDA DO MÊS` no prompt enquanto `pending_first_session_invite=true`

## Memória

Atualizar `mem://features/sessions/first-session-invite-d0` para registrar a precedência sobre `needs_schedule_setup` e que vale para todos os planos.
