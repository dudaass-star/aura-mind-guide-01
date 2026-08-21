# Maria Aparecida: por que não saiu o WhatsApp de recuperação

## O que aconteceu (confirmado nos dados)

- Checkout dela: 20/08 19:38 BRT, Essencial mensal, PIX Automático, status `created` (não pagou).
- A rotina de WhatsApp **rodou** às 19:55 BRT e **decidiu não enviar**: o registro ficou com `whatsapp_recovery_last_error = "skipped: phone_lifetime_cap"`.
- Motivo do bloqueio: o telefone 16994666047 já é uma lead antiga. Histórico de tentativas:
  - 26/04, 05/05, 06/05, 09/05: envios de recuperação (e-mail/estágios).
  - 20/05: **3 falhas WhatsApp com erro "Authenticate"**, e depois 2 envios WhatsApp OK.
- A regra atual de "cap vitalício" bane o telefone para sempre se ele já recebeu 2+ mensagens **ou** se teve **qualquer** falha registrada. Ela cai nos dois critérios.
- O e-mail de recuperação **saiu normalmente** (estágio 1 às 20:40 BRT). Só o WhatsApp foi suprimido.

Ou seja: não foi falha de entrega nem bug de disparo — foi a trava de segurança fazendo o que foi programada para fazer.

## O problema real por trás disso

O cap vitalício trata falha da **nossa** infraestrutura como se fosse rejeição do destinatário. Olhando as 259 falhas de WhatsApp registradas:

- 136 são `Authenticate` (credencial errada da subconta Twilio, período de 20/05),
- 68 são `Twilio could not find a Channel with the specified From address` (remetente mal configurado),
- 13 `Invalid Parameter`,
- o resto são números realmente inválidos.

**86 telefones distintos** estão banidos para sempre por falhas que, na maioria, nunca chegaram ao WhatsApp do usuário. Maria Aparecida é um desses casos: uma lead nova de agosto silenciada por um erro de configuração nosso de maio.

## Ajustes propostos

### 1. Separar falha nossa de rejeição do destinatário
O banimento vitalício passa a valer só para falhas atribuíveis ao número/usuário (número inválido, destinatário inexistente, bloqueio/opt-out). Erros de infraestrutura — `Authenticate`, `could not find a Channel`, `Invalid Parameter`, 5xx — deixam de banir; a tentativa continua logada, mas o telefone volta a ser elegível.

### 2. Limpar o passivo dos 86 telefones
Reclassificar as tentativas antigas cujo erro é de infraestrutura, para que essas leads voltem a ser elegíveis em checkouts **futuros** (sem reabrir disparo retroativo de sessões velhas).

### 3. Cap por número com janela, não vitalício
Manter proteção contra insistência, mas com regra sã: no máximo 2 mensagens de recuperação por telefone **por checkout**, e no máximo 1 ciclo de recuperação por telefone a cada 30 dias. Assim uma lead que voltou 3 meses depois é tratada como nova oportunidade, e não como contato queimado.

### 4. Deixar o motivo visível no admin
No painel de recuperação, mostrar o motivo do "pulado" em linguagem clara (ex.: "telefone com cap de 30 dias", "já pagou", "falha de configuração") em vez do código cru.

### 5. Caso da Maria Aparecida agora
Liberar o registro dela (limpar o `skipped` do estágio 15min) para que o próximo ciclo faça o disparo de recuperação, já que ela não pagou e o e-mail é o único toque que ela teve.

## Detalhes técnicos

- `supabase/functions/recover-abandoned-checkout-whatsapp/index.ts`: construção de `lifetimeBannedPhones` passa a filtrar `checkout_recovery_attempts` por classe de erro (lista de padrões de infraestrutura ignorados); contagem de `recovery_messages` passa a ser janelada em 30 dias em vez de vitalícia; mesmo tratamento no caminho Asaas (`processStageAsaas`).
- Migração leve: nenhuma coluna nova obrigatória; a reclassificação do passivo é um `UPDATE` de `status` para `wa_stage_1_infra_error` nas linhas com erro de infraestrutura (sai do `like 'wa_%failed'`).
- `src/pages/AdminWhatsappRecovery.tsx`: mapa de códigos → texto legível.
- Redeploy de `recover-abandoned-checkout-whatsapp`.

## Fora de escopo

- Reabrir disparo retroativo para as sessões antigas dos 86 telefones.
- Mudar o gatilho de 15 minutos ou os templates aprovados.
