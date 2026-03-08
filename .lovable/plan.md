
Objetivo: restaurar imediatamente as respostas da Aura no WhatsApp (falha atual de boot).

1) Diagnóstico confirmado
- O `aura-agent` não está iniciando (BootFailure), então nenhuma mensagem é processada.
- Log atual: `Uncaught SyntaxError: Identifier 'sessionAudioCount' has already been declared`.
- Causa no código: `sessionAudioCount` foi declarado duas vezes no mesmo escopo em `supabase/functions/aura-agent/index.ts`:
  - bloco de contexto dinâmico (~linha 3237)
  - bloco de controle de áudio (~linha 4550)

2) Correção proposta (hotfix mínimo e seguro)
- Arquivo: `supabase/functions/aura-agent/index.ts`
- Ajuste: manter apenas **uma** declaração de `sessionAudioCount` no escopo.
- Implementação recomendada:
  - Renomear a variável do bloco de contexto para algo sem colisão (ex.: `sessionAudioCountForContext`) e atualizar apenas o template textual que usa esse valor.
  - Preservar a variável `sessionAudioCount` do bloco de controle de áudio (usada na lógica real de envio de áudio e incremento de contador).
- Resultado esperado: a função volta a bootar e responder normalmente no WhatsApp.

3) Validação após correção
- Verificar logs do `aura-agent` para garantir ausência de `BootFailure`.
- Enviar mensagem teste real no WhatsApp (“Aura”) e confirmar resposta.
- Rodar `run-system-tests` (pelo menos: casual, emotional, session_part1/2) para garantir que não houve regressão no fluxo terapêutico.
- Confirmar no painel `/admin/testes` que não há novos HTTP 500.

4) Blindagem para evitar repetição
- Fazer varredura rápida no `aura-agent` por declarações duplicadas em escopo amplo (`const ...` repetido após refatoração).
- Aplicar convenção de nomes para variáveis de contexto de prompt (`...ForContext`) vs variáveis de lógica operacional (`sessionAudioCount`, etc.) para prevenir novas colisões.

Impacto esperado:
- Correção rápida, sem alterar comportamento terapêutico, apenas removendo o erro de sintaxe que impede inicialização.
