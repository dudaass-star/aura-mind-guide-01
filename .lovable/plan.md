# PIX Automático: confirmação do D+7 e 3 pontas que a mudança abre

## Confirmado

O mandato criado às 18:55 de hoje nasceu com o 1º débito em **20/08/2026** (D+7), valor cheio R$ 29,90, entrada R$ 6,90 (`is_trial`, `trial_value_cents = 690`). Os mandatos gerados antes da mudança (13:47 e 18:45 de hoje, e os de 12/08) seguem com o 1º débito em D+30 — a Woovi já registrou aquela data e ela não muda sozinha.

O que já está coerente e não precisa de ajuste:
- Copy do checkout e do modal do QR falam "7 dias / 1ª semana" e a data exibida vem do `next_charge_date`.
- O evento `Purchase` (Meta e ChatGPT Ads) só dispara no 1º pagamento — o débito do dia 8 não vira venda nova.
- O acesso da Aura é liberado por `profiles.status`, não pela data de validade — encurtar a validade para 7 dias não corta a conversa antes da hora.
- A cadência de recuperação/dunning é ancorada no vencimento da parcela, não em "30 dias" — continua funcionando com ciclo começando no dia 8.

## O que a mudança abre (3 pontas)

### 1. Auditoria assume que o mandato "só debita em D+30"
A varredura de conclusão parcial foi escrita com essa folga. Com D+7, o caso **mandato aprovado + entrada de R$ 6,90 não paga** pode virar um débito de R$ 29,90 no dia 8 de alguém que nunca pagou a entrada e nunca teve acesso liberado.
Ajuste: nesse estado, além do follow-up único de hoje, cancelar o mandato quando o QR expirar sem a entrada paga, antes de chegar no dia 7. E atualizar o comentário que ainda diz D+30.

### 2. Quem pagou os R$ 6,90 mas não autorizou o mandato tem 7 dias, não 30
Hoje esse cliente recebe **um** follow-up e nada mais. Antes havia um mês de margem para ele autorizar; agora a assinatura morre no dia 8 em silêncio.
Ajuste: um segundo lembrete perto do fim da janela (por volta do 5º dia) com o link de autorização, e, se o dia 7 passar sem mandato, entrar na régua de retenção já existente em vez de simplesmente parar.

### 3. Mandatos antigos com 1º débito em D+30
São poucos (2 aguardando de hoje + os ativos de 12/08). Duas opções, e eu recomendo a primeira:
- **Deixar como está**: o cliente ganha mais dias de acesso pelo mesmo R$ 6,90. Nenhum risco financeiro, só uma inconsistência de relatório.
- Cancelar e pedir novo QR: mexe com quem já pagou e pode gerar confusão — não recomendo.

## Detalhes técnicos

- `supabase/functions/woovi-pix-audit/index.ts`: cancelar mandato + cobrança na varredura 3 quando o QR expirou com mandato aprovado e entrada não paga; segundo lembrete de autorização (novo carimbo, para não repetir) na varredura 1b; corrigir o comentário do topo.
- Nenhuma alteração em `criar-pix-recorrente-woovi` ou `webhook-woovi` — o D+7 está correto nos dois.
- Nenhuma alteração de UI.
