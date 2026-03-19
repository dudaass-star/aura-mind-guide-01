

# Correção da Experiência da Tânia

## Situação

Tânia (`user_id: 0eb3f48b-2088-40d9-b1e0-f386338b4b05`, plano `essencial`, status `trial`, `trial_conversations_count: 49`) recebeu CTAs de conversão no meio de uma conversa terapêutica sobre fibromialgia e retorno aos estudos.

Duas mensagens problemáticas em 19/03 às 11:58:
1. `093bc075` — resposta legítima MAS com CTA de checkout colado no final ("Essa é uma das nossas últimas conversas grátis... 👉 https://olaaura.com.br/checkout")
2. `df921310` — mensagem pura de CTA ("/assinar?plan=aura_direcao Te espero do outro lado 💜")

## Ações

### 1. Deletar as 2 mensagens de CTA do histórico
Remover as mensagens `093bc075` e `df921310` para que a Aura não veja CTAs no contexto.

### 2. Enviar mensagem de recuperação manual
Via `admin-send-message`, enviar uma mensagem da Aura retomando a conversa sobre o EJA e a escola, pedindo desculpas pelo erro técnico e confirmando que o acesso dela está normal.

### 3. Salvar a mensagem de recuperação no histórico
O `admin-send-message` já faz isso automaticamente quando `user_id` é fornecido.

## Detalhes técnicos

- Migration SQL para deletar: `DELETE FROM messages WHERE id IN ('093bc075-5afb-47e0-86c7-37c8e577b91a', 'df921310-cd84-4069-a6df-3d47e7d25126')`
- Mensagem enviada via edge function `admin-send-message` com phone `5522997935808` e user_id `0eb3f48b-2088-40d9-b1e0-f386338b4b05`

