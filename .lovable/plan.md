
Diagnóstico atual (confirmado pelos logs):
- O webhook recebe a mensagem normalmente, encontra usuário e chama o agente.
- A falha acontece no boot do `aura-agent` com: `Uncaught SyntaxError: Identifier 'sessionAudioCount' has already been declared`.
- Enquanto esse boot error existir, a Aura não responde no WhatsApp (independente do modelo).

Plano de correção (hotfix + validação):
1) Isolar a colisão de escopo no `supabase/functions/aura-agent/index.ts`
- Revisar o bloco de contexto dinâmico (regra de áudio) e o bloco de envio/controle de áudio.
- Garantir nomenclatura sem colisão:
  - contexto: `sessionAudioCountForContext`
  - lógica operacional: `sessionAudioCount`
- Validar que não há segunda declaração de `sessionAudioCount` no mesmo escopo do handler.

2) Blindar para não repetir
- Aplicar padrão de nomes:
  - variáveis de prompt/contexto: `...ForContext`
  - variáveis de decisão operacional: nomes sem sufixo.
- Fazer varredura rápida no arquivo por declarações duplicadas em escopo amplo pós-refatoração.

3) Publicar novamente as funções críticas
- Republicar `aura-agent` (obrigatório).
- Republicar `webhook-zapi` (recomendado para garantir cadeia estável ponta a ponta).

4) Verificação técnica imediata
- Conferir logs do `aura-agent` até aparecer `booted` sem `BootFailure`.
- Confirmar no `webhook-zapi` que a chamada ao agente não retorna mais `BOOT_ERROR`.

5) Verificação funcional fim a fim
- Enviar mensagem real “Aura” no WhatsApp.
- Confirmar resposta recebida.
- Rodar testes no `/admin/testes` (mínimo: casual, emotional, session_part1 e session_part2) para garantir que a troca de modelo + áudio/sessão seguem estáveis.

Resultado esperado:
- Boot do agente normalizado.
- Respostas restauradas no WhatsApp.
- Sem regressão nos fluxos de sessão/áudio com Flash Low.
