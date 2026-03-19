

# Correção da Experiência da Ana Livia

## Situação Atual

Ana Livia está com `status = 'trial'`, `trial_conversations_count = 50`, plano `direcao`. Ela recebeu 3 CTAs automatizados (11:25, 11:40, 13:25) no meio de uma sessão terapêutica profunda sobre dinâmica familiar. Suas últimas mensagens (12:24 e 12:31) ficaram **sem resposta** — a Aura não respondeu porque o bloco de trial limitava o processamento.

O código já foi corrigido e deployado — o bloco de trial limit foi removido do `process-webhook-message`. Mas ela continua sem resposta.

## Ações Necessárias

### 1. Enviar mensagem de recuperação manual
Usar `admin-send-message` para enviar uma mensagem da Aura reconhecendo o erro técnico e retomando a conversa. Algo como:

> "Ana, me desculpa por aquelas mensagens estranhas. Foi um erro técnico no meu sistema — aquilo não deveria ter acontecido, especialmente no meio da nossa conversa. Você estava me contando algo muito importante sobre sua família e o Gabriel, e eu quero muito continuar te ouvindo. Tá tudo certo com o seu acesso, pode falar comigo quando quiser 💜"

### 2. Remover as mensagens de CTA do histórico
Deletar as 3 mensagens de CTA do banco de dados (`messages` table) para que a Aura não veja esses CTAs como parte do histórico e fique confusa em respostas futuras. São as mensagens com `role = 'assistant'` contendo links de checkout nos horários 11:25, 11:40 e 13:25.

### 3. Salvar a mensagem de recuperação no histórico
Inserir a mensagem de desculpas como `role = 'assistant'` no `messages` para que fique no contexto da Aura.

## Detalhes Técnicos

- Deletar mensagens requer uma migration (RLS não permite DELETE para users, e o service role precisa de um statement direto)
- A mensagem será enviada via `admin-send-message` edge function
- Não é necessário alterar `trial_conversations_count` ou `status` — o código já ignora esses campos

## O que NÃO muda
- O deploy do `process-webhook-message` sem trial limits já está feito
- Quando ela mandar a próxima mensagem, será processada normalmente

