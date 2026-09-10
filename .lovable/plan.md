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
2. **O convite chega tarde.** Ele só sai 48h depois, num lead que já esqueceu a Aura — daí os 4% de resposta.

## Sobre misturar com a recuperação normal — não mistura

Conferi as regras de exclusão que já existem na régua e elas separam os trilhos:

- **Quem copiou o código PIX** recebe a régua do PIX (15 min e 2h) e fica de fora da mensagem genérica de 15 min. Um nunca rouba o lead do outro.
- A recuperação normal continua intacta: 15 min e 24h, com horário silencioso, limite de mensagens por número e guarda de "já pagou / já é cliente".
- As mensagens do encontro usam **travas e limites próprios**: quem já recebeu a oferta, já pagou, já é cliente, já usou o encontro ou está em conversa recente fica de fora. Uma pessoa nunca recebe convite e recuperação juntos.
- O lembrete do código de R$ 6,90 usa a janela de conversa que o próprio lead abriu ao pedir o código — não conta no limite de contatos em 30 dias e é cancelado na hora se ele pagar.

Uma sobra de mistura a ser resolvida no ajuste: o convite do encontro hoje fica preso atrás da mensagem de 24h da régua normal, então na prática ele sai perto de 48h. É por isso que ele chega tarde — e é isso que o item 2 abaixo corrige, mantendo os trilhos separados.

## O que fazer

1. **Lembrete de código não pago**: 45 minutos depois de gerar o código, uma mensagem curta ("o código continua valendo, é um encontro só"). Se ainda não pagou, um último toque na manhã seguinte. Depois disso, silêncio — nada de perseguir. Cancelado automaticamente se pagar.
2. **Antecipar o convite**: o convite do encontro passa a sair ~6h depois da tentativa de pagamento (em vez de ~48h), ainda no mesmo dia — sem encostar nas mensagens de 15 min e 24h da recuperação normal.
3. **Quem clicou em "Ficou uma dúvida" e a conversa morreu também recebe o convite.** Hoje responder qualquer coisa descarta o lead para sempre; passa a valer só conversa recente (24h).
4. **Painel simples**: uma linha no admin com convite enviado → respondeu → código gerado → pago, por semana, pra acompanhar sem consultar o banco.
5. Nada muda para quem já pagou, já é cliente, ou já usou o encontro — as travas atuais continuam.

## Detalhes técnicos

- `supabase/functions/recover-abandoned-checkout-whatsapp/index.ts`:
  - Estágio 5 (`copiou_taster`): `minAgeMinutes` 2880 → 360 e `prevSentColumn` de `whatsapp_recovery_24h_sent_at` para `wa_copiou_2h_sent_at` (o estágio do encontro deixa de depender do genérico de 24h; âncora passa a ser a régua do PIX, que é a régua certa para esses leads). Mantido `ageColumn: created_at`, quiet hours e todas as guardas.
  - Guarda `lead_respondeu_usa_porta_a`: só bloqueia com inbound nas últimas 24h ou se já existir `taster_offers` para o telefone; conversa fria volta a ser elegível.
- Lembrete: ao criar a oferta em `_shared/taster.ts` (chamado por `criar-pix-taster`), agendar `scheduled_tasks` `taster_code_reminder` em +45min e +1 dia 09h BRT, com `payload.offer_id`; execução dedupada por `offer_id`, cancelada quando `taster_offers.paid_at` existe, respeitando horário silencioso; envio pela subaccount de recuperação em texto livre (janela de 24h aberta pelo clique).
- Painel: nova seção no `AdminWhatsappRecovery.tsx` lendo `checkout_sessions.wa_copiou_taster_sent_at` e `taster_offers` (`accepted_at`, `paid_at`) agrupados por semana.
- Sem migração de schema; nenhum envio real durante a validação (dry-run do trilho + preview do lembrete).
