

## Plano: Corrigir validação de assinatura do webhook Instagram

### Problema
Os logs mostram "Invalid webhook signature" em todos os POSTs da Meta. O secret `INSTAGRAM_APP_SECRET` armazenado não corresponde ao App Secret real.

### Passos

1. **Solicitar atualização do secret `INSTAGRAM_APP_SECRET`** com o valor correto do painel Meta (Configurações > Básico > Chave Secreta do Aplicativo)

2. **Adicionar logs de debug no webhook** (`supabase/functions/webhook-instagram/index.ts`):
   - Logar os primeiros 10 caracteres da assinatura recebida vs esperada para facilitar diagnóstico
   - Modo "warn but continue": se a assinatura falhar, logar warning mas continuar processando (temporário, para testar o fluxo completo)

3. **Testar novamente** com um comentário ou DM no Instagram para confirmar que o fluxo funciona

### Detalhes técnicos
- Arquivo modificado: `supabase/functions/webhook-instagram/index.ts` (linhas 47-60)
- Alteração: adicionar `console.warn` com prefixos das assinaturas e remover o `return` que bloqueia o processamento
- Após confirmar funcionamento, restaurar a validação estrita

