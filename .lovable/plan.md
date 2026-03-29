

## Cancelar e deletar usuários

### Situação encontrada

**7 usuários específicos** (Dais Palagi, Luciana, Fabio Oliveira, Felipe, Daniela, Richard, Dimas) — todos com status `active` no banco, mas **nenhum deles tem cliente ou assinatura no Stripe**. Isso significa que são perfis sem cobrança ativa.

**Usuários em trial** — há 35 perfis com status `trial` no banco. Preciso cruzar com as ~25 assinaturas `trialing` no Stripe para identificar quais trial users não têm cartão (não completaram checkout).

### Plano de execução

**Etapa 1 — Deletar os 7 usuários específicos**

Deletar diretamente da tabela `profiles` via migration (DELETE):
- Dais Palagi (phone: 555199531705)
- Luciana (phone: 555180321023)  
- Fabio Oliveira (phone: 555181417690)
- Felipe (phone: 14159108243)
- Daniela (phone: 555181519706)
- Richard (phone: 555196359846)
- Dimas (phone: 555193223515)

Também limpar dados relacionados (messages, sessions, checkins, etc.) para esses `user_id`s.

**Etapa 2 — Identificar e deletar trial users sem cartão**

Buscar os phones/emails dos customers com assinatura `trialing` no Stripe, cruzar com os 35 perfis `trial` no banco. Os que não tiverem match no Stripe = sem cartão → deletar.

### Detalhes técnicos

- Usar edge function `cleanup-inactive-users` ou script SQL direto para deletar
- Tabelas a limpar por user_id: `profiles`, `messages`, `sessions`, `checkins`, `user_insights`, `session_themes`, `commitments`, `conversation_followups`, `aura_response_state`, `scheduled_tasks`
- Como não há assinaturas no Stripe para os 7 específicos, não precisa cancelar nada lá

