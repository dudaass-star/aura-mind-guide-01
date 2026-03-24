

# Fix: Cancelamento da Cápsula do Tempo no estado `awaiting_audio`

## Problema

No estado `awaiting_audio` (linhas 491-520), o código tem apenas dois caminhos:
1. Recebeu áudio → aceitar
2. Qualquer outra coisa → enviar reminder

Não há verificação de cancelamento. O usuário fica preso em loop infinito de reminders. A verificação de cancelamento (`deixa|cancela|desist...`) só existe no estado `awaiting_confirmation` (linha 541).

## Solução

**Arquivo**: `supabase/functions/process-webhook-message/index.ts`

Adicionar check de cancelamento **antes** do reminder no bloco `awaiting_audio` (entre linhas 509 e 510):

```
if (capsuleState === 'awaiting_audio') {
  if (hasAudio && audioUrl) { ... }  // já existe

  // NOVO: Check de cancelamento
  const lowerMsg = (messageText || '').toLowerCase().trim();
  if (/deixa|cancela|desist|não quero|nao quero|esquece|para|parar/i.test(lowerMsg)) {
    // Limpar estado, enviar confirmação de cancelamento, retornar
  }

  // Reminder (já existe) — só chega aqui se não for cancelamento
}
```

A lógica de cancelamento é idêntica à que já existe no `awaiting_confirmation` (linhas 541-553): limpa o perfil, envia mensagem amigável, salva no histórico, libera lock.

Redeploy da função após a alteração.

