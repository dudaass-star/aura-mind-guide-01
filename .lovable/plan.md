

## Limpeza Automática de Usuários Inativos

### Contexto atual

Na base hoje existem 17 usuários registrados na instância "Aura #1":
- **12 ativos** (pagantes, planos essencial/direcao/mensal)
- **5 em trial** — sendo que 4 deles **nunca enviaram nenhuma mensagem** e o mais antigo (Dimas Martins) está há **41 dias** sem interagir

O problema: cada usuário cadastrado ocupa 1 vaga no `current_users` da instância WhatsApp (max 250). Usuários que fizeram trial, nunca converteram e abandonaram continuam "travando" vagas indefinidamente.

---

### Critérios de exclusão propostos

Serão deletados perfis que se enquadrem em **qualquer** das categorias abaixo:

| Categoria | Critério |
|---|---|
| Trial fantasma | `status = 'trial'` + `last_message_date IS NULL` + mais de **7 dias** desde `trial_started_at` |
| Trial expirado | `status = 'trial'` + última mensagem há mais de **30 dias** |
| Cancelado antigo | `status = 'canceled'` + última mensagem há mais de **60 dias** |

> **Nota:** Usuários `active` nunca são deletados automaticamente, independente de inatividade.

---

### O que acontece na exclusão

1. O perfil é **deletado** da tabela `profiles`
2. O `current_users` da instância vinculada é **decrementado** automaticamente (via trigger no banco)
3. Os dados relacionados (messages, sessions, insights, etc.) são removidos em cascata — **ou** são anonimizados dependendo da política de privacidade desejada

---

### Implementação técnica

**1. Trigger no banco para decrementar `current_users`**

Quando um perfil é deletado, um trigger executa:
```sql
UPDATE whatsapp_instances
SET current_users = current_users - 1
WHERE id = OLD.whatsapp_instance_id;
```

**2. Nova edge function: `cleanup-inactive-users`**

Executada via cron (uma vez por dia, ex: 3h da manhã), a função:

1. Busca perfis elegíveis para exclusão conforme os critérios acima
2. Para cada perfil encontrado, registra um log antes de deletar
3. Deleta o perfil (o trigger cuida do decremento da instância)
4. Retorna um resumo: quantos foram deletados por categoria

**3. Cron job diário**

Agendado via `pg_cron` para rodar a função uma vez por dia às 3h (horário de Brasília).

---

### Impacto imediato (base atual)

Com os critérios propostos, **4 dos 5 usuários trial** seriam elegíveis para exclusão imediata:
- Dimas Martins — 41 dias, nunca interagiu
- Teste — 15 dias, nunca interagiu  
- teste — 14 dias, nunca interagiu
- teste qa 10 — 14 dias, nunca interagiu

Apenas a Camila (8 dias, interagiu em 11/02) ficaria.

O `current_users` passaria de 17 para 13.

---

### Pontos de atenção

- Usuários com `status = 'canceled'` que ainda estão no período pago (acesso ativo) **não devem ser deletados ainda** — o critério dos 60 dias garante essa janela
- A função não envia mensagem de despedida para esses usuários (já foram notificados via reactivation-check ou nunca chegaram a usar de verdade)
- O plano não toca em nenhum usuário `active`, garantindo zero risco para pagantes

---

### Arquivos a criar/modificar

1. **Migration SQL** — criar trigger `on_profile_delete` para decrementar `current_users`
2. **`supabase/functions/cleanup-inactive-users/index.ts`** — nova edge function com a lógica de limpeza
3. **`supabase/config.toml`** — adicionar `verify_jwt = false` para a nova função
4. **Cron job** — agendar via SQL (`pg_cron`) para execução diária às 3h

