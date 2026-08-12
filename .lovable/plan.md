# Avisos de 09 e 11/08 do Geová: não foi falha de entrega

Fui no banco antes de mexer em qualquer coisa. Os dois registros com `whatsapp_sent = false` nessas datas têm `error_stage = 'limit_reached'` e a mensagem "Já enviados 4 WhatsApps neste ciclo (limite 4)". Ou seja: o WhatsApp não saiu **porque a régua tem teto de 4 mensagens por ciclo de cobrança** (2 avisos + 30% off + Lite), e ele já tinha recebido as 4 (01, 03, 05 e 07/08). O template HX68e8… está íntegro e é o mesmo que o `system_config` aponta hoje.

E o cliente não ficou no escuro nesses dois dias: o e-mail `dunning-payment-failed` foi enviado e registrado como `sent` em 09/08 15:01 e 11/08 19:01, junto com todas as outras 4 tentativas.

Detalhe histórico que explica a estranheza dos SIDs: nos avisos 1 e 2 (01 e 03/08) saíram os templates de oferta (30% e Lite), porque a régua "2 avisos primeiro" só entrou depois, em 04/08. Do dia 05 em diante a ordem está correta. Nada a fazer aí.

## O que realmente está errado (1 item, pequeno)

A auditoria mente sobre canal. No caminho de e-mail do `stripe-webhook`, o sucesso do envio grava `whatsapp_sent = true` no registro de `dunning_attempts` (o comentário no código diz "reusing field as notification_sent"), e esse registro fica com `channel` nulo. Resultado: quem olha a tabela ou o painel não distingue "e-mail entregue" de "WhatsApp entregue", e é exatamente por isso que os dias 09 e 11 pareciam falha de envio.

Correção proposta:
- gravar `channel = 'email'` nesses registros e usar um campo próprio de resultado em vez de reaproveitar `whatsapp_sent`;
- manter a contagem do teto de 4 restrita a `channel = 'whatsapp'` (já é, mas fica explícito) para o ajuste não mexer na régua.

## O teto não pode matar a escada — e hoje ele tem zero folga

Você está certo. Reli a contagem: o teto não é um número solto, é `noticeSteps + ladder.length` (2 avisos + 30% + Lite = 4). Em teoria a escada sempre completa. O problema é que ela só completa se **nenhum** dos 4 disparos se perder — e o Stripe dá exatamente 4 tentativas de cobrança por ciclo (Smart Retries, ~3 semanas). Folga zero.

Basta um degrau cair por qualquer motivo — perfil sem telefone naquele momento, `token_missing`, template recusado pela Twilio, ou a oferta cair fora da janela 08h–21h e a tarefa adiada não executar — e o ciclo termina **sem nunca ter enviado o degrau Lite**. A escada existe, mas pode não chegar ao fim. Foi esse desenho que fez 09 e 11/08 baterem em `limit_reached`: as 4 fichas já tinham sido gastas (no caso dele, nos templates da régua antiga) e não havia mais espaço para a régua correta acontecer.

Correção proposta: **trocar "máximo de 4 mensagens" por "cada degrau sai uma vez"**.

- Em vez de contar mensagens entregues e comparar com um teto, olhar **qual degrau já foi entregue** no ciclo e enviar o próximo que ainda não saiu.
- `limit_reached` passa a existir só quando o **último degrau da escada já foi entregue** — aí sim não há mais nada a dizer por WhatsApp.
- Consequência: um degrau perdido não consome a vaga do próximo; a régua se auto-recupera na tentativa de cobrança seguinte, e o volume em condição normal continua sendo 4 mensagens por ciclo (não aumenta pressão no número).

Garantia de fechamento: quando o Stripe esgota os retries (assinatura vira `unpaid`/`canceled`), se algum degrau ainda não tiver saído, disparar o degrau pendente mais avançado antes de encerrar o ciclo (adiando para a janela de marketing se preciso). Assim o fluxo que desenhamos sempre chega, no mínimo, até a oferta Lite.

## O que eu sugiro NÃO mudar

- O volume máximo por ciclo em condição normal (4 mensagens): a mudança acima não aumenta esse número, só impede desperdício de ficha.
- A régua de retries do Stripe (~3 semanas) e o acesso mantido durante ela.
- O degrau Base (R$ 9,90), que segue só em /cancelar.

## Detalhes técnicos

- `supabase/functions/stripe-webhook/index.ts`: no bloco `invoice.payment_failed`, separar o registro de e-mail (`channel: 'email'`) do registro de WhatsApp; parar de setar `whatsapp_sent = true` no sucesso do e-mail.
- `supabase/functions/_shared/dunning-whatsapp.ts`: trocar a checagem `prevCount >= maxAttempts` por resolução de degrau a partir do que já foi entregue no escopo do ciclo (`invoice_id` → `payment_id` → `subscription_id`); `limit_reached` só quando o último degrau da escada estiver entregue. Vale igual para cartão, PIX Asaas e PIX Woovi (que usa `noticeSteps = 0`).
- `supabase/functions/stripe-webhook/index.ts`: no encerramento do ciclo (assinatura → `unpaid`/`canceled` por falha), disparar o degrau pendente mais avançado se a escada não tiver terminado.
- Sem migração de schema (`channel`, `provider` e o tier já existem em `dunning_attempts`).
