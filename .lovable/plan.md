

# Adicionar Verificacao de Conversa em Andamento e DND ao Relatorio Semanal

## Problema

O `weekly-report` envia para todos os usuarios ativos sem verificar:
1. Se o usuario esta em modo "Nao Perturbe" (`do_not_disturb_until`)
2. Se houve mensagem recente do usuario (conversa possivelmente em andamento)

Todas as outras automacoes (follow-up, check-in, conteudo periodico, reativacao) ja respeitam o DND, mas o relatorio semanal nao.

## Mudancas no arquivo `supabase/functions/weekly-report/index.ts`

### 1. Filtrar usuarios com DND na query inicial (linha 205-209)

Adicionar filtro `.or()` na query de perfis para excluir usuarios com DND ativo, igual ao `scheduled-checkin` ja faz:

```typescript
const { data: profiles, error: profilesError } = await supabase
  .from('profiles')
  .select('*')
  .eq('status', 'active')
  .not('phone', 'is', null)
  .or('do_not_disturb_until.is.null,do_not_disturb_until.lte.' + new Date().toISOString());
```

### 2. Verificar conversa recente antes de enviar (dentro do loop, apos linha 220)

Antes de gerar o relatorio de cada usuario, verificar se houve mensagem do usuario nos ultimos 10 minutos. Se sim, pular o envio para nao interromper uma conversa ativa:

```typescript
// Skip if user sent a message in the last 10 minutes (active conversation)
const recentCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
const { count: recentUserMessages } = await supabase
  .from('messages')
  .select('*', { count: 'exact', head: true })
  .eq('user_id', profile.user_id)
  .eq('role', 'user')
  .gte('created_at', recentCutoff);

if ((recentUserMessages || 0) > 0) {
  console.log(`💬 Skipping ${userName} - active conversation (message in last 10min)`);
  continue;
}
```

### 3. Verificar sessao em andamento (junto com a verificacao acima)

Tambem pular se o usuario tiver uma sessao ativa (`in_progress`):

```typescript
// Skip if user has an active session
if (profile.current_session_id) {
  const { data: activeSession } = await supabase
    .from('sessions')
    .select('status')
    .eq('id', profile.current_session_id)
    .eq('status', 'in_progress')
    .maybeSingle();
  
  if (activeSession) {
    console.log(`🧘 Skipping ${userName} - session in progress`);
    continue;
  }
}
```

## Resumo das verificacoes (em ordem)

1. **DND ativo** - filtrado na query (nem entra no loop)
2. **Sessao em andamento** - skip no loop
3. **Mensagem recente (10 min)** - skip no loop

## O que NAO muda

- Formato do relatorio
- Logica de metricas e analise de evolucao
- Insercao na tabela `messages` e `weekly_plans`
- Anti-burst delay
