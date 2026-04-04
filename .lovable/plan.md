

## Plano: Diagnosticar e corrigir erro "Channel did not accept given content"

### Contexto

Você tem razão — o design original era colocar o texto personalizado dentro de `{{1}}`. O fluxo funciona assim:

1. Template aprovado pela Meta: `prefix` (fixo) + `{{1}}` (dinâmico) + `— Aura`
2. O código sanitiza `\n` → espaço (evita erro 21656)
3. O `splitMessageForTemplate` garante que não exceda 1024 chars

O código está correto para esse design. O erro "Channel did not accept given content" (erro 63016 do Twilio) indica que a **Meta rejeitou o conteúdo da variável**, não que o código está errado.

### Possíveis causas

1. **Template aprovado com estrutura diferente** — A Meta pode ter aprovado o template `aura_reconnect_v2` com `{{1}}` como placeholder de nome curto, não como corpo dinâmico. Precisamos verificar o corpo exato do template no Twilio.

2. **Conteúdo da variável incompatível** — A Meta tem políticas de conteúdo para variáveis de template. Textos longos com emojis ou certos padrões podem ser rejeitados.

3. **Tamanho real excede o limite** — Embora o split cuide disso, precisamos confirmar que o texto pós-sanitização ainda cabe.

### Passos

**1. Verificar a estrutura real do template no Twilio Console**

Precisamos confirmar o corpo exato do `aura_reconnect_v2` (ContentSid: `HX824b3f789beb78ace2a1f38d8527c718`). Vou criar uma edge function de diagnóstico que consulta o **Twilio Content API** (`/v1/Content/{ContentSid}`) para retornar a estrutura do template — incluindo o body aprovado pela Meta e o mapeamento de variáveis.

Isso nos dirá exatamente o que `{{1}}` espera.

**2. Teste de envio controlado**

Após verificar a estrutura, enviar um teste para o seu número (Eduardo) com um texto curto na variável para confirmar que o template funciona. Depois enviar com o texto completo para identificar o limite exato da rejeição.

**3. Corrigir com base no diagnóstico**

- Se `{{1}}` é corpo dinâmico (como planejado): o problema é no conteúdo → sanitizar melhor ou encurtar
- Se `{{1}}` é apenas nome (Meta mudou na aprovação): ajustar a lógica para enviar só o nome e manter o corpo fixo no template

### Arquivo criado/alterado

- `supabase/functions/debug-template-structure/index.ts` — Edge function temporária que consulta `GET /v1/Content/{ContentSid}` via Twilio API e retorna a estrutura do template para diagnóstico

