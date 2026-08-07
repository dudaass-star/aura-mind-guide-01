# Recuperação de pagamento: 4 furos que estão deixando clientes sair sem receber nada

Auditoria dos últimos 30 dias, canal por canal. A escada de ofertas em si está certa. O problema é que muita gente nunca chega a receber o primeiro aviso.

## O que já funciona

- Cadência no WhatsApp desde 05/08: aviso 1 → aviso 2 → 30% off → Lite, com os templates certos (conferido nos envios de 05, 06 e 07/08).
- Cadência no e-mail rodando em paralelo.
- Registros antigos com oferta na primeira tentativa e teto de 2 mensagens são de antes da correção — não voltam a acontecer.

## O que não funciona

| Furo | Casos em 30 dias | Consequência |
|---|---|---|
| 1. Win-back pós-cancelamento nunca disparou | 30 cancelados, 0 mensagens | Ninguém é convidado a voltar |
| 2. Renovação de assinante ativo descartada | 19 faturas | Cliente ativo perde acesso sem nenhum aviso |
| 3. Cliente sem perfil no banco = silêncio total | 44 casos | Nem WhatsApp nem e-mail saem |
| 4. Falha de entrega no WhatsApp sem plano B | 3 casos | Degrau pulado, nada cobre |

---

## Furo 1 — O win-back nunca rodou

Existe a rotina `winback-canceled-users` (D+3, D+14, D+30, template aprovado `aura_reconnect_v2`). No banco: 32 perfis cancelados, 30 com data de cancelamento e **zero** win-back registrado — as três colunas de controle estão todas vazias, nunca preenchidas.

Quem cancela ou cai por falta de pagamento sai do radar por completo. O degrau Base de R$ 9,90 só existe dentro da página `/cancelar`, e ninguém é levado até lá.

O que fazer: descobrir por que a rotina não roda (agendamento ausente ou trava interna), rodar em modo seco para ver quantos elegíveis existem hoje, e então ligar de verdade.

## Furo 2 — Renovação de assinante ativo sendo descartada

19 faturas de renovação de clientes ativos foram descartadas pelo webhook sem gerar nenhum aviso.

Caso conferido agora no Stripe: fatura `in_1TwiP0…`, cliente do **Transformação R$ 79,90**, motivo da cobrança `subscription_cycle` (renovação normal do mês), assinatura viva, **9 tentativas de cobrança falhadas**, fatura aberta e não paga. Nenhuma mensagem saiu em nenhum canal.

Causa: o Stripe mudou o formato do dado. A assinatura agora vem em `parent.subscription_details.subscription` e o código ainda lê o campo antigo `subscription`; não achando, ele encerra o processamento.

Isso não tem relação com carrinho abandonado — o fluxo de carrinho continua separado e intocado. Aqui são clientes que já pagam e falharam na renovação.

## Furo 3 — Cliente sem perfil no banco não recebe nada

Quando o telefone vindo do gateway não casa com nenhum perfil, o webhook aborta antes de tudo: não sai WhatsApp e não sai e-mail — mesmo com telefone e e-mail na mão, vindos do próprio gateway.

44 ocorrências em 14 dias, pelo menos 12 clientes distintos. Um deles, do Direção R$ 49,90, acumulou 8 falhas e teve a assinatura cancelada sem uma única mensagem.

O que fazer: quando não houver perfil, seguir em modo degradado nos dois canais — WhatsApp para o telefone do gateway (com link curto do portal de cobrança, que não depende de token de usuário) e e-mail para o endereço do gateway.

## Furo 4 — Falha de entrega no WhatsApp fica sem cobertura

A Twilio aceita o envio e depois avisa que não entregou (erro 63027). Hoje isso só vira linha de log: o degrau não é reenviado e nenhum outro canal cobre a lacuna.

O que fazer: ao receber a confirmação de não entrega, disparar o e-mail equivalente daquele degrau e reagendar uma tentativa de WhatsApp para o dia seguinte, dentro da janela permitida.

## Auditoria — hoje é cega

280 tentativas registradas, nenhuma com o degrau da escada gravado. Não há como responder "quantos receberam a oferta de 30%?" nem medir aceite por degrau. Passar a gravar o degrau e os dias de atraso em todo registro, e mostrar no painel a distribuição por degrau mais as linhas de "sem perfil", "não entregue" e "win-back enviados".

## Escopo técnico

- `winback-canceled-users` + agendamento: investigar a não execução, rodar dry-run, ativar cron diário 10h BRT.
- `stripe-webhook/index.ts`: ler `parent.subscription_details.subscription` como fallback antes de descartar a fatura.
- `stripe-webhook/index.ts` e `webhook-asaas/index.ts`: no ramo sem perfil, seguir para WhatsApp + e-mail em modo degradado com `error_stage` próprio.
- `_shared/dunning-whatsapp.ts`: aceitar telefone/nome do gateway sem perfil; persistir `offer_tier` e `days_past_due`.
- `webhook-twilio-recovery/index.ts`: ao marcar não entrega, acionar e-mail do degrau e reagendar o WhatsApp.
- `src/pages/AdminEngagement.tsx`: distribuição por degrau e as três linhas novas de diagnóstico.

## Fora de escopo

Valores das ofertas, templates aprovados, janela 08h–21h BRT, cadência PIX (D0/D+2/D+4) e o fluxo de carrinho abandonado ficam exatamente como estão.
