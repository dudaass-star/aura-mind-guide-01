

## Remover perfil duplicado da Nilda Rita

Existem dois perfis:

| Perfil | Telefone | Jornada | Msgs | Última msg |
|--------|----------|---------|------|------------|
| `2b13cadb` | 5551981519712 (correto) | j1-ansiedade | 14 | hoje 12:36 ✅ |
| `71e88f06` | 555181519712 (sem o 9) | null | 15 | hoje 00:16 ❌ |

**Manter**: `2b13cadb` — telefone correto, jornada atribuída, conversa mais recente.
**Deletar**: `71e88f06` — telefone com formato errado, sem jornada.

### Ação
1. Deletar as mensagens do perfil `71e88f06` (15 mensagens)
2. Deletar o perfil `71e88f06` da tabela `profiles`

Isso também vai decrementar o `current_users` da instância WhatsApp associada (via trigger `decrement_instance_on_profile_delete`).

