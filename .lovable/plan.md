## Diagnóstico

O problema não é mais o email do perfil Aura. Esse ajuste funcionou: o perfil **Eduardo Santos** já está com `duda.ass@gmail.com`.

A causa real é anterior ao vínculo por email:

- O login Google entra com o auth user `d2d4526a...`.
- Esse mesmo auth user tem `role=admin`, então o admin continua funcionando corretamente.
- Mas também existe um perfil antigo/de teste na tabela `profiles` com `user_id = d2d4526a...`, nome **Admin**, telefone `test-admin`.
- A função `link-portal-account` para logo no começo quando encontra qualquer perfil com o `auth.uid()` atual e responde “já vinculado”. Por isso ela nunca chega a procurar o perfil real do Eduardo por email.
- Resultado: no `/meu-espaco`, o app busca `profiles.user_id = d2d4526a...` e carrega o perfil **Admin**, não o perfil Aura real `Eduardo Santos`.

## Plano de correção

1. **Corrigir o dado conflitante**
   - Desvincular o perfil fake/de teste **Admin** do auth user do Eduardo.
   - Manter intacto o papel admin em `user_roles`, para `/admin` continuar funcionando.
   - Não apagar dados de conversa sem revisão.

2. **Forçar o vínculo correto do portal**
   - Atualizar o perfil Aura real **Eduardo Santos** para usar `user_id = d2d4526a...`, que é o usuário autenticado via Google.
   - Migrar os dados relacionais do user antigo `329ebadd...` para `d2d4526a...` nas tabelas do portal/conversa, como mensagens, sessões, resumos, cápsulas, tarefas e estados.
   - Isso faz o mesmo login Google servir para:
     - `/admin`: acesso admin via `user_roles`.
     - `/meu-espaco`: painel do Eduardo via `profiles`.

3. **Endurecer a função de vínculo para não repetir o bug**
   - Ajustar `link-portal-account` para, quando encontrar um perfil “próprio” claramente placeholder/teste (`phone = 'test-admin'` ou perfil sem email real), ainda procurar um perfil legado pelo email do login.
   - Assim um perfil fake não bloqueia o vínculo correto no futuro.

4. **Validar depois da execução**
   - Consultar o banco para confirmar que `d2d4526a...` aponta para o perfil **Eduardo Santos**.
   - Conferir que `user_roles` ainda mantém `admin` nesse mesmo auth user.
   - Pedir um novo logout/login no `/meu-espaco` para confirmar visualmente.

## Observação importante

Há 48 mensagens e alguns registros ligados ao user admin antigo `d2d4526a...`, além de 1044 mensagens no user Aura real `329ebadd...`. Antes de migrar, vou preservar esses registros e evitar deleção destrutiva; se houver conflito de dados, priorizo manter o histórico real do Eduardo.