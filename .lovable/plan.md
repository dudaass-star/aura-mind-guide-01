## Verificação sem incomodar o Luiz

Confirmei no banco:
- `auth.users` do Luiz: `7cc08615...` (novo, último login 01/06 17:50).
- `profiles` do Luiz ainda aponta para o user_id legado `6c88c2a1...` — ou seja, a última tentativa dele realmente falhou pelo erro de FK em `messages` que vimos no log.

Para validar a correção **sem pedir nova tentativa pra ele**, vou rodar manualmente via SQL exatamente o que a função `link-portal-account` corrigida faz:

1. `UPDATE` em cada tabela com FK para `profiles.user_id` (messages, sessions, checkins, commitments, conversation_followups, time_capsules, user_insights, user_meditation_history, weekly_plans, asaas_payments e demais já mapeadas) trocando `6c88c2a1...` → `7cc08615...`.
2. `UPDATE profiles SET user_id = '7cc08615...'` no profile do Luiz.

Se tudo passar:
- O profile do Luiz fica vinculado ao auth user novo.
- Na próxima vez que ele abrir `/meu-espaco` (sem precisar refazer nada agora), a função entra no ramo `already-linked` e o portal passa direto da tela de WhatsApp.
- Isso prova tanto que a ordem nova de operações resolve o erro de FK quanto que o portal vai funcionar pra ele sem nova interação.

Se algum `UPDATE` falhar (alguma FK que esquecemos no array), eu adiciono a tabela na função e redeployo antes de avisar.

## Fora do escopo

- Não vou tocar em outros usuários.
- Sem mudanças de UI ou schema.