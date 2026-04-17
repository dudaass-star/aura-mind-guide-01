
Objetivo: corrigir o teste para que ele envie o template da Jornada de forma garantida, e não “fingir” template enquanto na prática manda a mensagem pós-template direto.

O que encontrei
- O `test-episode-send` hoje chama `sendProactive(...)` mesmo quando `force_template = true`.
- Esse `force_template` só mexe em `last_user_message_at` para simular janela de 24h fechada.
- Só que o `sendProactive(...)` ainda depende do provider ativo em `system_config.whatsapp_provider`.
- Se o provider ativo estiver em `zapi`, ele ignora completamente a lógica de template/janela e manda texto direto.
- Ou seja: o teste atual não garante template. Ele só “tenta” induzir o caminho de template.
- Além disso, o teste não falha quando sai como `freetext`; então ele pode aparentar sucesso mesmo mandando a coisa errada.

Diagnóstico mais provável
1. O provider ativo no ambiente de teste/produção está em `zapi`, então `force_template` nunca terá efeito real.
2. Mesmo se o provider estiver `official`, o endpoint de teste está mal desenhado porque continua usando uma função “automática”, em vez de um caminho “template-only”.

Plano de correção
1. Auditar o estado real antes de mexer
- Verificar o valor atual de `system_config.whatsapp_provider`.
- Verificar logs mais recentes de `test-episode-send` para confirmar se o envio saiu como `template` ou `freetext`.
- Verificar se a categoria `content` está apontando para o template `jornada_disponivel` ativo.

2. Tornar o teste determinístico
- Refatorar `test-episode-send` para ter um modo explícito de teste de template, sem depender de janela de 24h nem de roteamento automático.
- Em vez de usar `sendProactive(...)` no teste, chamar um caminho dedicado de “enviar template oficial agora”.
- Esse caminho deve enviar o `jornada_disponivel` diretamente e só usar o `pending_insight` para a mensagem que virá após o clique.

3. Falhar fechado quando não for template
- Se o usuário pedir teste de template, a função deve retornar erro se o envio não sair como `template`.
- Incluir no retorno/log:
  - provider ativo
  - categoria/template usado
  - tipo real do envio (`template` vs `freetext`)
  - motivo do fallback, se houver

4. Reduzir chance de regressão
- Extrair um helper claro para “template-only send” no módulo compartilhado de WhatsApp.
- Manter `sendProactive(...)` para fluxos normais automáticos.
- Usar o helper novo apenas em cenários de QA/teste/manual resend onde template precisa ser obrigatório.

5. Validar ponta a ponta
- Reenviar o template da Jornada para o Eduardo usando o novo caminho determinístico.
- Confirmar que no WhatsApp chega o template com botão.
- Depois validar que o clique no botão continua disparando a entrega do `pending_insight` pelo fast-path já implantado.

Arquivos que devem entrar
- `supabase/functions/test-episode-send/index.ts`
- `supabase/functions/_shared/whatsapp-provider.ts`
- `supabase/functions/_shared/whatsapp-official.ts`

Sem mudanças de banco
- Não vejo necessidade de migration ou ajuste de RLS para esse problema.

Resultado esperado
- Quando pedirmos “mandar o template para testar”, o sistema enviará obrigatoriamente o template de verdade.
- Se não conseguir enviar template, vai acusar erro explícito em vez de mandar a mensagem pós-template e confundir o teste.
- Isso também cria uma base segura para testar outros fluxos com botão, como relatório semanal e boas-vindas.
