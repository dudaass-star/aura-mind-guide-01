
# Plano: Corrigir Erro de Timeout no Cadastro Trial

## Problema Identificado

O erro `ERR_TIMED_OUT` está ocorrendo no preflight (requisição OPTIONS) do navegador ao tentar chamar a edge function `start-trial`. A causa raiz é que os **headers CORS estão incompletos** na edge function.

O cliente Supabase envia headers adicionais que precisam ser explicitamente permitidos:
- `x-supabase-client-platform`
- `x-supabase-client-platform-version`
- `x-supabase-client-runtime`
- `x-supabase-client-runtime-version`

**Evidência**: Quando testei a função diretamente (sem passar pelo navegador), ela funcionou perfeitamente e criou um perfil de teste com sucesso.

## Solução

Atualizar os headers CORS na edge function `start-trial` para incluir todos os headers necessários.

## Mudanças no código

**Arquivo: `supabase/functions/start-trial/index.ts`**

Alterar as linhas 3-6 de:
```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
```

Para:
```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
```

## Por que isso resolve

O navegador faz uma requisição preflight (OPTIONS) antes da requisição real (POST) para verificar se o servidor permite os headers que o cliente quer enviar. Se o servidor não permitir explicitamente esses headers no `Access-Control-Allow-Headers`, o navegador bloqueia a requisição.

## Resultado Esperado

Após a correção:
1. O preflight será bem-sucedido
2. A requisição POST será processada normalmente
3. O usuário será redirecionado para `/trial-iniciado`
4. A mensagem de boas-vindas será enviada via WhatsApp

## Nota sobre o teste

Criei um perfil de teste durante a investigação (email: teste@teste.com). Você pode querer removê-lo do banco de dados depois.
