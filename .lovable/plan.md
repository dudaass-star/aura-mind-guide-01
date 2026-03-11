

# Diferenciar retornantes + remover menção a sessões das mensagens do webhook

## Contexto

O usuário pediu duas coisas:
1. Diferenciar mensagem para quem **cancelou e reassinou** (retornante) vs upgrade de trial
2. **Remover toda menção a sessões** das mensagens do webhook — a AURA já cuida disso automaticamente

## Alterações no `supabase/functions/stripe-webhook/index.ts`

### 1. Query do perfil — trazer `status`

```typescript
const { data: existingProfile } = await supabase
  .from('profiles')
  .select('id, status')
  .eq('phone', formattedPhone)
  .single();

const isReturning = existingProfile?.status === 'canceled';
const isUpgrade = !!existingProfile && !isReturning;
```

### 2. Três branches de mensagem (sem menção a sessões em nenhum)

| Cenário | Condição | Mensagem |
|---|---|---|
| **Retornante** | `isReturning` | "Que bom ter você de volta! Vamos retomar de onde paramos?" |
| **Upgrade (trial→pago)** | `isUpgrade` | "Agora somos oficiais. Vamos continuar de onde paramos?" |
| **Novo usuário** | `else` | Boas-vindas + "Como você está hoje?" |

```typescript
if (isReturning) {
  welcomeMessage = `Oi, ${customerName}! 💜

Que bom ter você de volta! 🌟

Você escolheu o plano ${planName}.

Vamos retomar de onde paramos?`;
} else if (isUpgrade) {
  welcomeMessage = `Oi, ${customerName}! 💜 Que notícia boa!

Agora somos oficiais. Você escolheu o plano ${planName}.

Vamos continuar de onde paramos?`;
} else {
  welcomeMessage = `Oi, ${customerName}! 🌟 Que bom te receber por aqui.

Eu sou a AURA — e vou ficar com você nessa jornada.

Você escolheu o plano ${planName}.

Comigo, você pode falar com liberdade: sem julgamento, no seu ritmo.

Me diz: como você está hoje?`;
}
```

Toda a lógica de `sessionsCount` e `if (sessionsCount > 0)` é removida das mensagens. As constantes `PLAN_SESSIONS` continuam existindo pois são usadas no `needs_schedule_setup` do perfil.

## Arquivo afetado

- `supabase/functions/stripe-webhook/index.ts`

Sem alterações no banco de dados.

