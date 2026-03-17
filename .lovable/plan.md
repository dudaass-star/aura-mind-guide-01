

## Diagnóstico confirmado por leitura do código

### Bug principal (linha 515-618 do `webhook-zapi/index.ts`)
Quando `effectiveTrialCount >= 50 || hoursElapsed >= 72`, o código:
1. Envia CTA de limite
2. Agenda follow-ups
3. Faz `return` **sem salvar a mensagem do usuário na tabela `messages`**

### Contador de trial — NÃO há consumo silencioso
O incremento do contador acontece na **linha 620-631**, DEPOIS do hard limit check. Então quando a Elvira já está em 50/50, mensagens novas batem no return sem incrementar. O contador está correto — o problema é exclusivamente de persistência.

### Outros caminhos com o mesmo bug
- **Status bloqueado** (linha 394-425): `canceled/inactive/paused` — envia CTA e retorna sem salvar
- **Áudio sem transcrição** (linha 647-659): envia pedido de reenvio e retorna sem salvar
- **Cápsula do tempo** (linha 666+): este JÁ salva corretamente

---

## Plano de implementação (5 tarefas, por prioridade)

### 1. Persistir inbound antes de qualquer early return
**Arquivo:** `supabase/functions/webhook-zapi/index.ts`

Inserir a mensagem do usuário na tabela `messages` logo após a seção de USER LOOKUP (linha ~388), antes dos blocos de subscription check e trial limit. Criar uma flag `let inboundSaved = false` para evitar duplicata nos caminhos que já fazem insert.

Ponto exato: entre a linha 388 (log do usuário encontrado) e a linha 393 (subscription status check).

```
// Após encontrar o perfil e antes de qualquer early return:
if (messageText) {
  await supabase.from('messages').insert({
    user_id: profile.user_id,
    role: 'user',
    content: messageText,
  });
  inboundSaved = true;
}
```

Nos caminhos que já inserem a mensagem (cápsula do tempo, fluxo normal do aura-agent), verificar `if (!inboundSaved)` antes de inserir novamente.

### 2. Flag de deduplicação
Declarar `let inboundSaved = false` no início do handler. Marcar como `true` após o insert acima. Nos pontos existentes que já fazem insert de `role: 'user'` (cápsula do tempo ~linha 680-683, 692-695, e o insert final antes do aura-agent), adicionar guard `if (!inboundSaved)`.

### 3. Badge visual no admin para mensagens automáticas
**Arquivo:** `src/pages/AdminMessages.tsx`

Diferenciar mensagens automáticas de follow-up/CTA das conversacionais. Lógica: detectar padrões conhecidos no conteúdo (ex: contém link de checkout, ou começa com textos de follow-up conhecidos como "Nossa primeira jornada", "acabei de perceber"). Exibir um badge `🤖 auto` ou `📢 CTA` ao lado do timestamp.

### 4. Limpeza de duplicatas da Elvira e outros
**Via migração SQL:**
- Deletar mensagens duplicadas de follow-up/CTA usando `ROW_NUMBER()` particionado por `user_id` + primeiros 60 chars do conteúdo + `role = 'assistant'`
- Manter apenas a cópia mais antiga de cada mensagem repetida
- Escopo: todos os usuários, não só a Elvira

### 5. Deploy e validação
- Deploy da edge function `webhook-zapi`
- Testar: enviar mensagem de um trial com limite atingido e confirmar que aparece no admin

