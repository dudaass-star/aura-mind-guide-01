# Recuperação de checkout: o painel está mentindo (não é falha de envio)

## O que eu verifiquei no banco

- **E-mail: os 3 envios estão acontecendo.** `checkout_recovery_attempts` tem 598 `stage_1_sent`, 588 `stage_2_sent`, 575 `stage_3_sent`, com o último estágio 3 hoje às 15:00. Nos checkouts de julho pra cá: 50 → 42 → 37. As últimas falhas de e-mail são de maio.
- **WhatsApp tem apenas 2 estágios por desenho** (15min e 24h), não 3. Então "faltar o terceiro" no WhatsApp é o comportamento atual, não um bug.
- **Os "Erro" vermelhos não são erro de envio.** Todos os registros recentes gravam `whatsapp_recovery_last_error = 'skipped: phone_lifetime_cap'` — ou seja, o envio foi **pulado** de propósito pela trava de segurança (telefone que já recebeu 2 mensagens de recuperação ou que já falhou uma vez fica fora para sempre, porque o Twilio cobra mesmo quando a Meta rejeita). Distribuição total dos "erros": 76 `phone_lifetime_cap`, 53 `active_customer_email`, 20 `active_customer_phone`, 17 `backlog_pre_cutoff`, 3 `already_paid_email` — nenhum é falha técnica. Falhas técnicas reais (`Twilio could not find a Channel with the specified From address`) existem, mas todas são de 24/05, o dia da ativação.
- **Bug real no painel:** quando um estágio é pulado, o código também preenche a coluna `whatsapp_recovery_15min_sent_at`. Resultado: linhas como Carlos Eduardo e Patrícia aparecem com "15min ✓" **e** "Erro" ao mesmo tempo — na verdade nada foi enviado pra elas.
- **Coluna "Envio e-mail" mostrando "Legado" em todas as linhas:** o badge só reconhece os status antigos (`api_accepted`, `failed`, `skipped`). O fluxo atual grava `stage_1_sent`, `stage_2_sent`, `stage_3_sent`, que caem no `else` e viram "Legado".

## O que ajustar (só painel)

Em `src/pages/AdminEngagement.tsx`, na tabela "Recuperação de Checkout Abandonado":

1. **Coluna "Envio e-mail"** passa a mostrar o estágio real: `1/3`, `2/3`, `3/3` (verde) a partir de `stage_N_sent`; `Falhou` para `stage_N_failed`; `Cliente ativo` / `Sem e-mail` para skips; "Legado" só para os registros antigos de fato.
2. **Coluna "Recup. WhatsApp"** separa enviado de pulado: quando o `last_error` começa com `skipped:`, mostrar um badge neutro (cinza) com o motivo em português — "Pulado: já recebeu 2 msgs", "Pulado: cliente ativo", "Pulado: já pagou", "Pulado: fora do cutoff" — e **não** mostrar "15min ✓" nesse caso. Vermelho fica reservado a falha técnica de verdade.
3. **Cabeçalho do card e o card de métrica "erros"**: separar em "pulados" e "erros", para o número de erros voltar a significar falha de entrega.
4. Acrescentar uma linha explicativa curta no card: e-mail = 3 estágios (1h / 25h / 97h), WhatsApp = 2 estágios (15min / 24h).

## Decisão pendente (fora do painel)

A trava vitalícia por telefone é hoje a maior causa de "não enviou": qualquer telefone com 2 mensagens anteriores nunca mais recebe recuperação, mesmo em um checkout novo meses depois. Se quiser, num passo seguinte eu troco isso por uma janela (ex.: máximo 2 mensagens por 30 dias, mantendo o banimento vitalício apenas para falhas técnicas). Não incluo nessa mudança porque muda regra de negócio e custo com Twilio.

## Detalhes técnicos

- Arquivo único: `src/pages/AdminEngagement.tsx` (badges e contadores). Nenhuma migração, nenhuma edge function, nenhum redeploy.
- Fonte dos dados já disponível na consulta atual: `checkout_sessions.recovery_stage*_sent_at`, `whatsapp_recovery_*_sent_at`, `whatsapp_recovery_last_error`, `attempt_status`.
