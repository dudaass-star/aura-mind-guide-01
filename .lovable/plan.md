

# Enviar mensagem manual para Michele e Amanda

## Contexto
Duas usuárias ficaram sem resposta durante a queda do sistema. Precisamos enviar uma mensagem natural, sem mencionar erro técnico.

## Ação

Chamar `send-zapi-message` para cada usuária com uma mensagem curta e natural:

**Mensagem**: *"Oi! Desculpa a demora 🤍 Estou aqui agora. Como você está?"*

### Usuárias
| Nome | Phone | user_id |
|------|-------|---------|
| Michele Caroline da Silva Prado | 5514998107426 | d42298dd-45ea-4d45-a181-8af95af6643a |
| Amanda Pimentel | 559284730665 | 04d60275-d84d-490c-8db8-f0ef5af435d8 |

### Execução
Duas chamadas ao edge function `send-zapi-message` com `isAudio: false`, passando phone, message e user_id de cada uma. A mensagem será salva automaticamente no histórico como `role: assistant`.

