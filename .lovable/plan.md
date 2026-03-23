

# Diagnóstico: Aura sem resposta para Tania (e potencialmente outros)

## Causa Raiz

As funções `aura-agent` e `process-webhook-message` deployadas estão **desatualizadas** em relação ao código fonte atual. Os erros nos logs confirmam isso:

1. **aura-agent**: `ReferenceError: recentUser is not defined` na função `evaluateTherapeuticPhase` - essa função nem existe mais no código fonte atual. O deploy está com versão antiga.

2. **process-webhook-message**: `ReferenceError: wasInterrupted is not defined` - o código fonte atual já declara essa variável (linha 691), mas a versão deployada não tem.

3. **aura-agent** (não-bloqueante): `supabase.from(...).insert(...).catch is not a function` - também código antigo.

## Impacto

- A Tania mandou 3 mensagens e **nenhuma foi respondida** na última ("Meu nome é Tânia..."). O aura-agent retornou HTTP 500 três vezes seguidas.
- Qualquer outro usuário que acionar o `evaluateTherapeuticPhase` também vai ficar sem resposta.

## Solução

### 1. Redeployar ambas as funções
Redeployar `aura-agent` e `process-webhook-message` com o código fonte atual. Não é necessário alterar código — o código fonte já tem os fixes, apenas o deploy está desatualizado.

### 2. Enviar mensagem de recuperação para Tania
Após o redeploy, enviar uma mensagem manual via `admin-send-message` para Tania (phone: `556699116369`, user_id: `756e41cb-1503-4736-bd7f-fa6ca5c44a06`) retomando a conversa naturalmente.

## Detalhes Técnicos

- `aura-agent/index.ts`: 6144 linhas, código fonte correto (sem `evaluateTherapeuticPhase`, sem `recentUser`)
- `process-webhook-message/index.ts`: 1028 linhas, `wasInterrupted` declarado na linha 691
- Deploy via ferramenta `supabase--deploy_edge_functions`

