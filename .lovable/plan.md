

## Mensagem de continuidade para usuários que vêm do trial

### Problema atual
Quando um usuário já conversou com a AURA durante o trial e depois assina um plano, o webhook envia a mesma mensagem de boas-vindas genérica ("Oi, eu sou a AURA..."), como se nunca tivessem conversado. Isso quebra a experiência de continuidade.

### Solução
Modificar o `stripe-webhook` para detectar se o perfil já existe (vindo do trial) e enviar uma **mensagem de upgrade** em vez da saudação padrão.

### Lógica
O webhook já verifica se o perfil existe (linha 164-168). Vamos usar essa verificação para escolher a mensagem:

- **Perfil existente (upgrade do trial):** Mensagem de continuidade reconhecendo que já se conhecem
- **Perfil novo (assinatura direta):** Mensagem de boas-vindas atual (sem mudança)

### Mensagem de upgrade (exemplo)

Para planos com sessões (Direção/Transformação):
> "Oi, [nome]! Que notícia boa! Você escolheu o plano [plano], que inclui [X] sessões especiais por mês! [detalhes das sessões + pergunta sobre agenda]"

Para plano Essencial:
> "Oi, [nome]! Que notícia boa! Agora somos oficiais. Você escolheu o plano Essencial. Vamos continuar de onde paramos?"

### Mudanças técnicas

**Arquivo:** `supabase/functions/stripe-webhook/index.ts`

1. Mover a verificação de perfil existente para **antes** do envio da mensagem
2. Se perfil existente: montar mensagem de upgrade/continuidade
3. Se perfil novo: manter mensagem de boas-vindas atual
4. Manter toda a lógica de criação/atualização do perfil no banco

### Reorganização do fluxo

```text
checkout.session.completed
  |
  +-- Verificar perfil no banco
  |
  +-- Perfil existe? (veio do trial)
  |     SIM -> Mensagem de upgrade
  |     NAO -> Mensagem de boas-vindas padrão
  |
  +-- Enviar mensagem via Z-API
  |
  +-- Criar ou atualizar perfil no banco
```

Nenhuma tabela ou migration é necessária.

