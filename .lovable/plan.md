## Diagnóstico

O usuário não está mais preso por cache/publicação. A chamada chegou na função `link-portal-account` e falhou no banco com:

```text
update or delete on table "profiles" violates foreign key constraint "messages_user_id_fkey"
```

Ou seja: a função tenta trocar o `profiles.user_id` do usuário antigo para o novo auth.uid **antes** de migrar as tabelas relacionadas (`messages`, etc.). Como essas tabelas têm chave estrangeira apontando para `profiles.user_id`, o banco bloqueia a alteração. A UI então volta para pedir o WhatsApp de novo, dando a impressão de loop.

## Plano de correção

1. **Corrigir a ordem em `link-portal-account`**
   - Primeiro migrar as tabelas filhas que referenciam `profiles.user_id` do `oldUserId` para o `newUserId`.
   - Depois atualizar o `profiles.user_id`.
   - Isso elimina o erro de chave estrangeira.

2. **Adicionar retry seguro para concorrência**
   - Como `PortalAuthContext` pode chamar `runLink()` mais de uma vez no login, a função deve ser idempotente:
     - se já estiver vinculado ao novo usuário, retorna `linked: true`;
     - se uma tentativa paralela já migrou parte dos dados, não deve quebrar o vínculo.

3. **Melhorar a resposta de erro para o portal**
   - Quando a função retornar `link_failed`, o frontend deve mostrar uma mensagem clara em vez de só voltar para o campo:
     - “Não consegui vincular agora. Tente novamente em alguns segundos ou fale com o suporte.”
   - Manter o número preenchido.

4. **Validar em produção**
   - Deploy da função `link-portal-account`.
   - Conferir logs com prefixo `🔗 [link]`.
   - Luiz deve refazer o teste; se chegar `update-ok`, o portal deve passar da tela do WhatsApp.

## Fora do escopo agora

- Meditação/envio de áudio.
- Mudanças em pagamento, suporte ou UI geral.
- Migração de schema/RLS, a princípio não necessária.