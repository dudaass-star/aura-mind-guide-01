

# Correção: Permitir Upload de Áudio no Bucket Meditations

## Problema Identificado

O upload de áudio está falhando com o erro:
```
StorageApiError: new row violates row-level security policy
```

**Causa**: A política RLS atual do bucket `meditations` só permite INSERT com `service_role`:
```sql
INSERT: (bucket_id = 'meditations') AND (auth.role() = 'service_role')
```

O código do frontend usa a chave anon (não autenticada), então o Storage bloqueia o upload.

---

## Solução

Adicionar uma política RLS que permita uploads anônimos no bucket `meditations`. Como esta é uma página administrativa interna e o bucket já é público para leitura, podemos permitir INSERT também.

### Migração SQL

```sql
-- Permitir uploads anônimos no bucket meditations (para admin page)
CREATE POLICY "Allow anonymous upload to meditations bucket"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'meditations');
```

Esta política permite que qualquer pessoa faça upload para o bucket `meditations`. Isso é aceitável porque:
1. A página `/admin/meditacoes` não é linkada na aplicação pública
2. O bucket já é público para leitura (qualquer um pode ver os arquivos)
3. Não há dados sensíveis - são apenas arquivos de áudio de meditação

---

## Alternativa Mais Segura (Opcional)

Se preferir mais segurança, podemos criar uma edge function para fazer o upload usando `service_role`. Isso manteria as políticas restritivas, mas adiciona complexidade. Me avise se preferir essa abordagem.

---

## Resultado

Após aplicar a migração:
- Upload de áudio funcionará normalmente na página de meditações
- Você poderá substituir qualquer áudio gerado por uma versão manual
- Download continuará funcionando (já funciona pois o bucket é público)

