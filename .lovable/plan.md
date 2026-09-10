# Encontro de R$ 6,90: o que está acontecendo hoje

Sim, está configurado e rodando. Números reais dos últimos 30 dias:

| Etapa | Números |
| --- | --- |
| Convite enviado por WhatsApp (quem tentou pagar no PIX e não fechou) | 148 envios / 115 pessoas |
| Responderam algo em até 72h | 5 pessoas (4%) |
| Clicaram em "Quero experimentar" | 5 |
| Código de R$ 6,90 gerado | 9 (5 pelo convite, 3 na conversa, 1 teste) |
| Pagaram | 1 (Sandra, pagou em 4 minutos) |
| Viraram plano depois | 0 |

Também aparecem 14 cliques em "Ficou uma dúvida" — mais gente abre conversa do que aceita direto.

## Os dois furos claros

1. **Ninguém é lembrado do código.** Das 8 pessoas que pediram o código de R$ 6,90, 7 não pagaram e **nunca receberam uma segunda palavra**. Sandra pagou em 4 minutos; as outras esfriaram em silêncio. Não existe nenhum lembrete hoje.
2. **O convite chega tarde.** Ele só sai 48h depois da tentativa de pagamento, e só para quem ficou totalmente calado. Nesse ponto o lead já esqueceu a Aura — daí os 4% de resposta. Quem responde qualquer coisa nunca recebe esse convite por mensagem; depende do agente lembrar de oferecer na conversa.

## O que fazer

1. **Lembrete de código não pago**: 45 minutos depois de gerar o código, uma mensagem curta ("o código continua valendo, é um encontro só"). Se ainda não pagou, um último toque no dia seguinte pela manhã. Depois disso, silêncio — nada de perseguir.
2. **Antecipar o convite**: o convite do encontro de R$ 6,90 passa a sair ~6h depois da tentativa de pagamento (em vez de 48h), ainda no mesmo dia em que a pessoa tentou pagar e desistiu.
3. **Quem clicou em "Ficou uma dúvida" e sumiu também recebe o convite.** Hoje ele é descartado por ter respondido. Se a conversa morreu sem oferta do encontro, o convite sai.
4. **Painel simples**: uma linha no admin com convite enviado → respondeu → código gerado → pago, por semana, pra acompanhar sem eu ter que consultar o banco.
5. Nada muda para quem já pagou, já é cliente, ou já usou o encontro — as travas atuais continuam.

## Detalhes técnicos

- `supabase/functions/recover-abandoned-checkout-whatsapp/index.ts`:
  - `COPY_STAGE_DEFS` estágio 5 (`copiou_taster`): `minAgeMinutes` 2880 → 360.
  - Guarda `lead_respondeu_usa_porta_a` passa a só bloquear quando houve inbound nas últimas 24h ou quando já existe `taster_offers` para o telefone; conversa fria volta a ser elegível.
- Lembrete: ao criar a oferta em `_shared/taster.ts` (`criar-pix-taster`), agendar `scheduled_tasks` `taster_code_reminder` em +45min e +1 dia 09h BRT, com `payload.offer_id`; execução dedupada, cancelada quando `taster_offers.paid_at` existe, e respeitando horário silencioso. Envio pela subaccount de recuperação (texto livre — janela de 24h aberta pelo próprio clique).
- Painel: nova seção no `AdminWhatsappRecovery.tsx` (ou `RecoveryInbox`) lendo `checkout_sessions.wa_copiou_taster_sent_at` e `taster_offers` (`accepted_at`, `paid_at`) agrupados por semana.
- Sem migração de schema; nenhum envio real durante a validação (dry-run do trilho + preview do lembrete).
