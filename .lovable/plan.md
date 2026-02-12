

## Corrigir perfil do Rodrigo e enviar boas-vindas

### Situacao atual
O Rodrigo foi cadastrado via `start-trial`, mas:
- O telefone ficou `5564279241473` (com "55" brasileiro adicionado automaticamente)
- O status ficou como `trial` em vez de `active`
- O plano ficou vazio em vez de `direcao`

### O que fazer

**1. Criar uma edge function utilitaria `admin-update-profile`**

Uma funcao simples que recebe `profile_id` e campos para atualizar. Vai ser util para operacoes futuras tambem.

Aceita: `{ profile_id, updates: { phone, status, plan, current_journey_id, current_episode, ... } }`

**2. Chamar a funcao para corrigir o perfil do Rodrigo**

Atualizar:
- `phone`: `64279241473`
- `status`: `active`
- `plan`: `direcao`
- `current_journey_id`: `j1-ansiedade`
- `current_episode`: `0`

**3. Enviar mensagem de boas-vindas via `admin-send-message`**

Enviar para o numero correto `64279241473` uma mensagem personalizada da AURA.

### Arquivos

**Novo:**
- `supabase/functions/admin-update-profile/index.ts` - Edge function para atualizar perfis (reutilizavel)

### Resultado
- Rodrigo cadastrado com plano Direcao, telefone correto, e mensagem de boas-vindas enviada
