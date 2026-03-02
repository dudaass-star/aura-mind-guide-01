

# Plano: Criar conta admin para Eduardo

## Situacao atual

A tabela `auth.users` esta vazia -- nenhuma conta web existe. Para atribuir a role `admin`, primeiro precisa existir um `user_id` no sistema de autenticacao.

Nao posso criar usuarios diretamente na tabela `auth.users` (schema reservado). O caminho e:

## Etapas

1. **Criar uma pagina de login admin** (`/admin/login`) com formulario de email/senha usando o sistema de autenticacao integrado (`signUp` + `signInWithPassword`)

2. **Voce se cadastra** com o email `duda.ass@gmail.com` e uma senha de sua escolha

3. **Eu insiro a role admin** na tabela `user_roles` para o `user_id` gerado apos o cadastro

4. **Atualizar a pagina AdminMeditations** para redirecionar para `/admin/login` quando nao autenticado (em vez de simplesmente bloquear)

## Detalhes tecnicos

- A pagina de login usara `supabase.auth.signUp()` e `supabase.auth.signInWithPassword()`
- Apos o primeiro cadastro, preciso confirmar o email (ou habilitar auto-confirm temporariamente para facilitar)
- A role sera inserida com: `INSERT INTO user_roles (user_id, role) VALUES ('<seu-user-id>', 'admin')`

