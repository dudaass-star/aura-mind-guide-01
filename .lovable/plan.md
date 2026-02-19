

# Multi-Numero WhatsApp com Balanceamento Aleatorio e Anti-Burst

## Resumo

Implementar uma infraestrutura de multiplos numeros WhatsApp com distribuicao aleatoria entre instancias ativas e um sistema de delay anti-burst para mensagens programadas.

## 1. Tabela `whatsapp_instances`

Nova tabela para armazenar as credenciais de cada numero WhatsApp:

| Campo | Tipo | Descricao |
|---|---|---|
| id | UUID | Chave primaria |
| name | TEXT | Nome amigavel (ex: "Aura #1") |
| phone_number | TEXT | Numero do WhatsApp |
| zapi_instance_id | TEXT | Instance ID do Z-API |
| zapi_token | TEXT | Token do Z-API |
| zapi_client_token | TEXT | Client Token do Z-API |
| max_users | INT (default 250) | Limite de usuarios |
| current_users | INT (default 0) | Contador atual |
| status | TEXT (default 'active') | active / paused / banned / disconnected |
| created_at | TIMESTAMPTZ | Data de criacao |

- RLS: Apenas `service_role` tem acesso (credenciais sensiveis)

## 2. Nova coluna em `profiles`

- Adicionar `whatsapp_instance_id` (UUID, nullable, FK para `whatsapp_instances`)

## 3. Migracao de dados

- Criar a primeira instancia usando as credenciais atuais das env vars (ZAPI_INSTANCE_ID, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN)
- Vincular todos os perfis existentes a essa instancia

## 4. Logica de Alocacao: Roleta Distribuida

Ao criar um novo usuario (em `start-trial` e `stripe-webhook`):

```text
Buscar todas instancias com:
  - status = 'active'
  - current_users < max_users

Selecionar uma ALEATORIAMENTE entre as disponiveis
  (usando ORDER BY random() LIMIT 1)

Vincular usuario a essa instancia
Incrementar current_users
```

Isso aquece todos os chips de forma natural e nao concentra novos usuarios em um unico numero.

## 5. Atualizacao do `zapi-client.ts`

A funcao `getZapiConfig()` passara a aceitar um parametro opcional com as credenciais da instancia:

```text
getZapiConfig()          -> usa env vars (retrocompativel)
getZapiConfig(instance)  -> usa credenciais do objeto passado
```

Todas as funcoes de envio (`sendTextMessage`, `sendAudioMessage`, etc.) passarao a aceitar um `config` opcional em vez de buscar das env vars internamente.

## 6. Funcao helper: buscar instancia do usuario

Nova funcao utilitaria que, dado um `user_id` ou `phone`, busca o perfil e retorna as credenciais da instancia vinculada. Se nao houver instancia vinculada, faz fallback para as env vars.

## 7. Delay Anti-Burst nas Mensagens Programadas

Adicionar um delay aleatorio de **25-45 segundos** entre cada envio nas seguintes edge functions:

| Edge Function | Delay atual | Novo delay |
|---|---|---|
| `scheduled-followup` | 1s | 25-45s aleatorio |
| `weekly-report` | 1.5s | 25-45s aleatorio |
| `periodic-content` | (sem delay explicito) | 25-45s aleatorio |
| `session-reminder` | (sem delay explicito) | 25-45s aleatorio |
| `scheduled-checkin` | (verificar) | 25-45s aleatorio |
| `conversation-followup` | (verificar) | 25-45s aleatorio |
| `reactivation-check` | (verificar) | 25-45s aleatorio |

O delay sera implementado como:
```text
const delay = 25000 + Math.random() * 20000; // 25-45 segundos
await new Promise(resolve => setTimeout(resolve, delay));
```

## 8. Atualizacao das Edge Functions de Envio

Cada funcao que envia mensagens sera atualizada para:

1. Buscar o `whatsapp_instance_id` do perfil do usuario
2. Carregar as credenciais daquela instancia
3. Usar essas credenciais no envio (em vez das env vars fixas)

**Functions afetadas:**
- `webhook-zapi` (resposta ao usuario)
- `send-zapi-message`
- `scheduled-followup`
- `weekly-report`
- `periodic-content`
- `session-reminder`
- `scheduled-checkin`
- `conversation-followup`
- `reactivation-check`
- `start-trial` (envio de boas-vindas)
- `stripe-webhook` (envio de confirmacao)
- `send-meditation`

## 9. Webhook de entrada (`webhook-zapi`)

O Z-API envia no payload o `instanceId` da instancia que recebeu a mensagem. O `webhook-zapi` usara esse campo para identificar qual instancia responder, buscando as credenciais corretas da tabela.

## 10. Retrocompatibilidade

- Se um perfil nao tem `whatsapp_instance_id`, usa as env vars atuais
- A primeira instancia eh criada automaticamente na migracao com os dados atuais
- Nenhuma funcionalidade existente quebra

## Ordem de Implementacao

1. Criar tabela `whatsapp_instances` e coluna em `profiles`
2. Inserir primeira instancia com credenciais atuais e vincular perfis existentes
3. Atualizar `zapi-client.ts` para aceitar config por parametro
4. Criar funcao helper de busca de instancia
5. Atualizar `start-trial` e `stripe-webhook` com alocacao aleatoria
6. Atualizar `webhook-zapi` para identificar instancia de origem
7. Atualizar todas as functions de envio programado com delay anti-burst e instancia dinamica
8. Atualizar `send-zapi-message` e `send-meditation`

