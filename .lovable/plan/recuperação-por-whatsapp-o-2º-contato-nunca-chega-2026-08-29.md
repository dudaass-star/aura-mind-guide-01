# Recuperação por WhatsApp: o 2º contato nunca chega

Confirmei nos dados: o estágio 1 (15 min) está saindo normalmente (58 envios nos últimos 10 dias, último ontem 17:30 BRT), mas o estágio 2 (24h) **falha 100% das vezes desde 21/08**. São 13.953 tentativas registradas com o mesmo erro da Twilio: `20422 Invalid Parameter`.

## Causa

O ContentSid do template de 24h está incompleto no código: `HX5f0f3dffb5f95da970bdbfab08a2488` tem 33 caracteres, e um SID da Twilio tem 34 (HX + 32). O do template de 15 min, que funciona, tem os 34. Ou seja: falta um caractere no SID do 2º template — a Twilio rejeita o parâmetro e nada é enviado.

Dois efeitos colaterais desse erro:

1. Como a falha não marca a coluna de envio, as mesmas 19 sessões são reprocessadas a cada 5 minutos, indefinidamente — daí as ~2.000 tentativas por dia e o lixo na tabela de tentativas.
2. Esse volume de falha alimenta o teto de 30 dias por telefone (`phone_window_cap`), que já bloqueou 15 leads que deveriam ter recebido contato.

## O que fazer

1. **Corrigir o ContentSid do template de 24h.** Preciso do SID correto e completo (34 caracteres) do template aprovado de 24h — leio a lista de templates da subconta de recuperação para confirmar o SID exato antes de trocar, sem enviar nenhuma mensagem.
2. **Parar o loop infinito.** Depois de 3 falhas no mesmo estágio para a mesma sessão, marcar a sessão como esgotada naquele estágio (com o erro gravado) em vez de tentar de novo a cada 5 minutos.
3. **Não deixar falha de template poluir o teto por telefone.** Erros de configuração (SID/template inválido) não devem contar como "número já contatado" no cap de 30 dias — só falhas atribuíveis ao número.
4. **Liberar quem ficou preso.** Zerar o marcador de bloqueio dos leads recentes barrados por `phone_window_cap` gerado por essas falhas, para que voltem à fila do 2º contato.
5. **Validar sem enviar.** Conferir o template pela API da subconta (leitura), rodar a função em modo de simulação e confirmar nos registros que o estágio 2 sai como `sent` no primeiro lead real seguinte.

## Detalhes técnicos

- `supabase/functions/recover-abandoned-checkout-whatsapp/index.ts`: constante `TEMPLATE_24H` (linha 29); bloco de falha em `processStage` (~linha 483) para contar tentativas por sessão/estágio e encerrar após 3; mesma lógica no caminho PIX (`processStageAsaas`).
- Contagem de falhas: ler `checkout_recovery_attempts` por `checkout_session_id` + `status` antes de enviar; sem mudança de schema.
- Cap de 30 dias: excluir das falhas contadas os erros com `provider_response.code` de configuração (20422 e afins).
- Limpeza: `UPDATE checkout_sessions` apenas nas linhas com `whatsapp_recovery_last_error = 'skipped: phone_window_cap'` dos últimos 30 dias.
- Nenhum envio real durante a verificação.
