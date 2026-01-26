

## Adicionar Usuário: Dais Palagi no Plano Direção

### Dados do Usuário
| Campo | Valor |
|-------|-------|
| Nome | Dais Palagi |
| Telefone | 555199531705 |
| Plano | direcao |
| Status | active |

### Ação a Executar

Vou inserir um novo registro na tabela `profiles` com os seguintes dados:

- **user_id**: UUID gerado automaticamente
- **name**: "Dais Palagi"
- **phone**: "555199531705" (formato: 55 + DDD + número)
- **plan**: "direcao"
- **status**: "active"
- **sessions_used_this_month**: 0
- **sessions_reset_date**: primeiro dia do mês atual

### O que acontece depois

1. O usuário Dais Palagi terá acesso ao plano **Direção** com **4 sessões especiais por mês**
2. A AURA enviará uma mensagem de boas-vindas automaticamente na primeira interação
3. O sistema de agendamento de sessões ficará disponível

### Seção Técnica

```sql
INSERT INTO public.profiles (
  user_id,
  name,
  phone,
  plan,
  status,
  sessions_used_this_month,
  sessions_reset_date,
  needs_schedule_setup,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'Dais Palagi',
  '555199531705',
  'direcao',
  'active',
  0,
  DATE_TRUNC('month', CURRENT_DATE),
  true,
  NOW(),
  NOW()
);
```

