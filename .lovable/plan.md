
# Plano: Adicionar Role de Admin para Eduardo

## Resumo
Adicionar a role de `admin` para o usuário Eduardo Santos (user_id: `329ebadd-07eb-4e1e-88db-d8974b2ea3e5`) na tabela `user_roles`.

## O que será feito

1. **Inserir registro na tabela user_roles**
   - Adicionar entrada com `user_id` = `329ebadd-07eb-4e1e-88db-d8974b2ea3e5` e `role` = `admin`

## Comando SQL que será executado

```sql
INSERT INTO public.user_roles (user_id, role) 
VALUES ('329ebadd-07eb-4e1e-88db-d8974b2ea3e5', 'admin');
```

## Resultado esperado
Após a execução, você terá acesso completo à página de administração de meditações (`/admin/meditations`).

## Seção Técnica

A tabela `user_roles` já existe com as seguintes características:
- Políticas RLS configuradas corretamente
- Função `has_role()` já implementada para verificação de roles
- O hook `useAdminAuth` já utiliza esta função para validar acesso admin

Após esta migração, quando você acessar a página `/admin/meditations`, o sistema irá:
1. Verificar sua autenticação
2. Chamar `has_role(user_id, 'admin')`
3. Retornar `true` e permitir acesso à página
