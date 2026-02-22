

# Anti-Burst por Instancia (por Numero WhatsApp)

## Problema Atual

Hoje o `antiBurstDelay()` e global: o sistema processa usuarios em sequencia e espera 25-45 segundos entre **cada envio**, independente de qual numero WhatsApp esta enviando. Se o numero A envia para o usuario 1, o numero B fica parado esperando sem necessidade.

Com 12 usuarios e 3 instancias, o tempo total hoje e ~6-9 minutos. Com a mudanca, cada instancia processa seus usuarios em paralelo, reduzindo para ~2-3 minutos.

## Solucao

Agrupar os usuarios por instancia e processar cada grupo em paralelo, mantendo o delay de 25-45s apenas entre envios **do mesmo numero**.

## Mudancas

### 1. `instance-helper.ts` - Nova funcao `antiBurstDelayForInstance`

Criar uma funcao que gerencia delays por instancia usando um `Map` de timestamps do ultimo envio:

```typescript
const lastSendByInstance = new Map<string, number>();

export async function antiBurstDelayForInstance(instanceId: string): Promise<void> {
  const lastSend = lastSendByInstance.get(instanceId) || 0;
  const elapsed = Date.now() - lastSend;
  const minDelay = 25000 + Math.random() * 20000; // 25-45s

  if (elapsed < minDelay) {
    const waitTime = minDelay - elapsed;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  lastSendByInstance.set(instanceId, Date.now());
}
```

A funcao `antiBurstDelay()` original sera mantida para compatibilidade.

### 2. `instance-helper.ts` - Funcao helper para agrupar usuarios por instancia

```typescript
export async function groupUsersByInstance(supabase, profiles): Map<string, profile[]>
```

Agrupa usuarios pelo `whatsapp_instance_id`. Usuarios sem instancia vao para um grupo "default".

### 3. Atualizar as 7 funcoes que usam anti-burst

Em cada funcao (`weekly-report`, `scheduled-checkin`, `scheduled-followup`, `conversation-followup`, `periodic-content`, `session-reminder`, `reactivation-check`):

- Agrupar usuarios por `whatsapp_instance_id`
- Processar cada grupo em paralelo com `Promise.all`
- Dentro de cada grupo, manter o loop sequencial com `antiBurstDelayForInstance(instanceId)`

Exemplo da estrutura (aplicada em todas):

```typescript
// Agrupar por instancia
const instanceGroups = new Map<string, typeof profiles>();
for (const profile of profiles) {
  const key = profile.whatsapp_instance_id || 'default';
  if (!instanceGroups.has(key)) instanceGroups.set(key, []);
  instanceGroups.get(key)!.push(profile);
}

// Processar cada instancia em paralelo
await Promise.all(
  Array.from(instanceGroups.entries()).map(async ([instanceId, groupProfiles]) => {
    for (const profile of groupProfiles) {
      // ... logica existente de processamento ...
      await antiBurstDelayForInstance(instanceId);
    }
  })
);
```

## Funcoes Afetadas (7 arquivos)

1. `supabase/functions/_shared/instance-helper.ts` - novas funcoes
2. `supabase/functions/weekly-report/index.ts`
3. `supabase/functions/scheduled-checkin/index.ts`
4. `supabase/functions/scheduled-followup/index.ts`
5. `supabase/functions/conversation-followup/index.ts`
6. `supabase/functions/periodic-content/index.ts`
7. `supabase/functions/session-reminder/index.ts`
8. `supabase/functions/reactivation-check/index.ts`

## Ganho de Performance

Com 3 instancias e 12 usuarios (4 por instancia):
- **Antes**: ~12 x 35s = ~7 minutos sequencial
- **Depois**: ~4 x 35s = ~2.3 minutos (3 grupos em paralelo)

## O que NAO muda

- Delay de 25-45s entre envios do mesmo numero (seguranca mantida)
- Toda logica de negocio (metricas, analise, DND, sessao ativa)
- Formato das mensagens e relatorios

