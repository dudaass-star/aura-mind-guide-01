

# Diagnóstico: Aura não está respondendo

## Situação

**NENHUMA** edge function está gerando logs — nem `webhook-zapi`, nem `process-webhook-message`, nem `aura-agent`, nem funções não relacionadas como `start-trial` e `create-checkout`. Isso indica um **problema global de deploy**, não um bug em uma função específica.

## Causa provável

O último deploy (correção do `await` no `send-meditation` dentro do `aura-agent`) pode ter causado uma falha no deploy de todas as funções. Como as edge functions do Supabase são deployadas como um conjunto, um erro em uma pode afetar todas.

## Solução

### 1. Re-deploy de todas as funções críticas

Fazer redeploy imediato das 3 funções do pipeline de mensagens:

- `webhook-zapi` (receptor)
- `process-webhook-message` (worker)
- `aura-agent` (IA)

### 2. Verificar logs após redeploy

Após o deploy, verificar se os logs voltam a aparecer e se as mensagens estão sendo processadas normalmente.

### 3. Se o redeploy falhar

Se alguma função falhar no deploy, o problema pode estar em imports quebrados ou incompatibilidades. Nesse caso, verificar:
- O `aura-agent/index.ts` (6148 linhas) — a última edição pode ter introduzido um erro de sintaxe
- Shared imports (`_shared/zapi-client.ts`, `_shared/instance-helper.ts`)

## Ação imediata

Redeploy das funções. Sem mudança de código — apenas forçar um novo deploy para restaurar o serviço.

