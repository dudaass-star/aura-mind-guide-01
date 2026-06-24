# Fix: upload manual de áudio de meditação falha com "violates row-level security policy"

## Diagnóstico

- Bucket `meditations`: público, 50MB, aceita `audio/mpeg|mp3|wav`. Seu MP3 de 10MB passa.
- Só existe 1 admin (`duda.ass@gmail.com`) e você está logado nele — então o `has_role(auth.uid(),'admin')` das policies de INSERT/UPDATE deveria passar.
- O erro "new row violates row-level security policy" no Supabase Storage tem **3 causas plausíveis** nesse cenário:
  1. `file.type` chega vazio/diferente do navegador → o bucket recusa por mime e o erro é embrulhado como RLS (comportamento conhecido).
  2. A policy de UPDATE existente (`Admins can update meditations bucket`) tem `USING` mas não tem `WITH CHECK` explícito. No `upsert:true` sobre arquivo já existente, o PostgreSQL às vezes não reaproveita o USING como WITH CHECK e bloqueia.
  3. Sessão JWT não chega no storage (raro, descartável por agora).

Vou atacar (1) e (2) — barato, reversível, e já cobre a maioria dos casos. Não vou criar edge function nesse momento: seria 80+ linhas novas pra manter, 20MB de tráfego extra por upload (cliente → edge → storage) e esconderia a causa raiz. Fica como plano B se isso aqui falhar.

## O que vou fazer

### 1. `src/pages/AdminMeditations.tsx` — `handleFileChange`
- Forçar `contentType: 'audio/mpeg'` no `supabase.storage.from('meditations').upload(...)` (o arquivo sempre é salvo como `audio.mp3`, então isso é seguro independente do tipo do arquivo de origem).
- Melhorar o `catch`: logar `error.message`, `error.statusCode` e `error.name` no console pra que, se ainda falhar, a próxima tentativa mostre a causa real (mime/rls/size) em vez do toast genérico.
- Refinar o toast: se `error.message` mencionar "mime" → "Formato de áudio não suportado". Se mencionar "row-level security" ou "policy" → "Sem permissão pra atualizar esse áudio (verifique se está logado como admin)". Caso contrário, mensagem atual.

### 2. Migração SQL — blindar policy de UPDATE no storage
Recriar a policy `Admins can update meditations bucket` com `WITH CHECK` explícito:
```sql
DROP POLICY "Admins can update meditations bucket" ON storage.objects;
CREATE POLICY "Admins can update meditations bucket"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'meditations' AND public.has_role(auth.uid(),'admin'))
WITH CHECK (bucket_id = 'meditations' AND public.has_role(auth.uid(),'admin'));
```
Sem mudança nas policies de INSERT, DELETE ou nas do service_role.

## Validação

1. Logada como admin em `/admin/meditacoes`, substituir o áudio com o mesmo MP3 de 10MB → toast de sucesso, áudio toca no player do portal.
2. Repetir o upload na mesma meditação (segundo upsert) → continua funcionando.
3. Se quebrar de novo, o console agora mostra a mensagem real → partimos pra edge function (plano B abaixo) com causa já identificada.

## Plano B (NÃO executar agora — só se o plano A falhar)

Criar `supabase/functions/admin-upload-meditation/index.ts` com `verify_jwt=true`, valida `has_role` via `getClaims()`, recebe multipart e faz upload via service role. Refatorar o client pra chamar `supabase.functions.invoke`. Resolve qualquer quirk de RLS de uma vez, mas adiciona complexidade que só compensa se o plano A não bastar.

## Riscos

- Mínimos. As mudanças são localizadas (1 arquivo TSX + 1 policy do storage) e reversíveis.
- A policy de UPDATE só fica mais explícita, sem mudar o comportamento de segurança esperado.
