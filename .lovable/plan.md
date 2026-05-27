## Vincular e-mail à conta Aura do Eduardo

Atualizar o perfil Aura `329ebadd…` (Eduardo Santos, telefone `51981519708`) gravando `email = 'duda.ass@gmail.com'`.

### Migração de dados

```sql
UPDATE public.profiles
SET email = 'duda.ass@gmail.com',
    updated_at = now()
WHERE id = '329ebadd-...'  -- perfil Aura do Eduardo
  AND email IS NULL;
```

(uso a tool `supabase--insert` por ser UPDATE de dados, não mudança de schema)

### Resultado esperado

- Próximo login Google com `duda.ass@gmail.com` em `/meu-espaco/entrar` → `link-portal-account` casa por e-mail e vincula automaticamente ao perfil Aura.
- `/admin` continua funcionando normalmente (role admin segue no `user_roles`).
- Nenhuma alteração de código necessária — só dados.

### Validação

1. Você desloga de `/meu-espaco`, loga de novo com Google.
2. Confere que aparece "Eduardo Santos" e os dados da sua jornada Aura (não a tela admin).
