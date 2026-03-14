

# Plano: Disparo de reativação com mensagem conversacional + reset do contador

## Ideia

Em vez de mandar uma mensagem de venda, a Aura simplesmente chama a pessoa pra conversar de novo — como faria uma amiga. Quando a pessoa responder, o contador de trial é resetado para 5, de modo que a próxima resposta da Aura será a 6ª conversa (restando 4 conversas + a condução gradual das mensagens 8, 9 e 10).

## Mensagem do disparo

> Oi, {nome}! Tava pensando em você... podemos conversar mais um pouco? 💜

Simples, curta, sem link, sem pressão. Como se a Aura estivesse puxando assunto naturalmente.

## Mudanças técnicas

### 1. Nova Edge Function: `reactivation-blast/index.ts`
- Busca profiles com `status = 'trial'` e `trial_conversations_count >= 10`
- Envia a mensagem curta acima via Z-API (instância correta por usuário)
- **Reseta `trial_conversations_count` para 5** e seta `trial_nudge_active = true`
- Atualiza `last_reactivation_sent`
- Retorna contagem de enviados

### 2. `webhook-zapi/index.ts` — Ajuste no fluxo de nudge response
- Quando o usuário responder (nudge_active = true), o bônus de 3 mensagens já existe — mas como o contador já foi setado para 5, o bônus levaria para 2. Assim a próxima interação contará como conversa 3, e o usuário terá ~7 conversas restantes antes do limite de 10.
- **Alternativa mais limpa**: ao invés de usar o bônus genérico, simplesmente manter o count em 5 (já feito no blast) e desativar `trial_nudge_active` normalmente. O resultado: a resposta do usuário incrementa para 6, e ele segue o fluxo normal com condução a partir da 8ª.

### 3. `src/pages/AdminEngagement.tsx`
- Botão "Reativar Trials" na aba Trial & Conversão
- Chama `supabase.functions.invoke('reactivation-blast')`
- Toast com resultado

### 4. `supabase/config.toml`
- Adicionar `[functions.reactivation-blast]` com `verify_jwt = false`

## Fluxo do usuário reativado

```text
Blast: "Oi, Maria! Tava pensando em você... podemos conversar mais um pouco? 💜"
  ↓ (counter resetado para 5)
Maria responde: "Oi! Claro, tô precisando conversar..."
  ↓ (counter vai para 6)
Aura responde normalmente (conversa 6)
  ↓
Conversas 7... normal
  ↓
Conversa 8 → lembrete gentil
Conversa 9 → penúltima com link
Conversa 10 → última com CTA emocional
```

## Arquivos impactados

1. `supabase/functions/reactivation-blast/index.ts` (novo)
2. `src/pages/AdminEngagement.tsx` (botão)
3. `supabase/config.toml` (config)

