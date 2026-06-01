## Problema

Encontrei **13 usuários no mesmo estado do Luiz**: já criaram conta auth (loginaram em `/meu-espaco`) mas o `profiles.user_id` ainda aponta para o ID legado, então toda vez que entram caem na tela de "informar telefone" e ao confirmar dá erro (mesmo bug que o Luiz tinha antes do cascade).

Lista (email — último login):
- antunesmarce@gmail.com — 01/06
- ivanfreitas70@gmail.com — 31/05
- natyliborio25@gmail.com — 29/05
- elaine.eclm@gmail.com — 29/05
- jairoaugusto30@gmail.com — 28/05
- jefmarper@gmail.com — 28/05
- nathaliaeira@gmail.com — 28/05
- studiokelyoliveira@gmail.com — 28/05
- samuelvenuto@gmail.com — 28/05
- milla.salles12@gmail.com — 26/05
- tainarxavier1@gmail.com — 25/05
- magalhaesrute25@gmail.com — 24/05
- daianecristinaah@gmail.com — 24/05
- sandraoliver2002@hotmail.com — nunca logou (ignorar, sem urgência)

## Plano

**Backfill em lote** aproveitando o `ON UPDATE CASCADE` já aplicado na migration anterior:

Para cada um dos 13 perfis (match por email entre `profiles` e `auth.users`), rodar:
```sql
UPDATE profiles
SET user_id = <auth.users.id>, updated_at = now()
WHERE id = <profile.id>;
```

O cascade propaga automaticamente para messages, checkins, commitments, conversation_followups, time_capsules, user_insights, user_meditation_history e weekly_plans. Nenhum usuário precisa tentar de novo — na próxima visita ao `/meu-espaco` já caem direto no estado "vinculado".

Vou executar como um único `UPDATE ... FROM auth.users WHERE profiles.email = auth.users.email AND profiles.user_id != auth.users.id` para cobrir todos de uma vez.

## Validação

Depois do update, rodo o mesmo SELECT de diagnóstico — deve retornar 0 linhas (exceto a Sandra que nunca logou e não tem o que vincular ainda).

## Fora de escopo

- Mexer no edge function `link-portal-account` (já corrigido na rodada anterior).
- Sandra (sem login) — quando ela logar pela primeira vez o fluxo corrigido cuida sozinho.
- UI, schema, RLS.
