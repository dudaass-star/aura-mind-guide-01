# Régua do PIX Automático Woovi: retentar por saldo, reautorizar só quando o mandato morreu

Você está certo na crítica. Reautorizar mandato é a ação errada para falta de saldo — o cliente já autorizou, o débito automático continua vivo, e a única coisa que faz sentido é tentar de novo até entrar saldo. Antes de mudar, uma correção do que eu disse antes:

## O que está realmente configurado hoje

- **Falha de ciclo (cobrança não paga)**: o `webhook-woovi` marca a falha, dispara o **aviso 1 na hora** e agenda **D+2, D+4, D+7**. Esses degraus enviam WhatsApp: avisos 1 e 2 genéricos, depois a escada de ofertas (no PIX vai direto para o **Lite**; o 30% off não roda no PIX porque depende de cartão salvo; o **Base** só aparece em `/cancelar`).
- **Reautorização não faz parte dessa régua.** O único ponto que pede reautorização é a auditoria (`woovi-pix-audit`), quando ela detecta que **o mandato foi cancelado no app do banco** — aí a recorrência realmente morreu e não há o que retentar. Nesse caso a mensagem é correta.
- **Não existe retentativa de cobrança no trilho Woovi.** Na criação do mandato (`criar-pix-recorrente-woovi`) nenhuma política de retry é enviada — diferente do Inter, que roda 3 tentativas em 7 dias. Ou seja: hoje, se falta saldo, a cobrança falha **uma vez** e nós apenas avisamos. Essa é a lacuna real.
- **O link do aviso genérico está quebrado para Woovi.** O botão manda para `/pagamento`, que chama `customer-portal`, e essa função só tem caminho para Stripe e Asaas. Cliente Woovi clica e não chega a lugar nenhum.

## O que mudar

**1. Retentar a cobrança do ciclo (o ponto central)**
Ao receber falha de ciclo por motivo recuperável (saldo insuficiente / limite), em vez de tratar como perda: reemitir a cobrança do mesmo ciclo sobre o mandato existente em **D+1, D+3 e D+6**, sem pedir nada ao cliente. Só depois de esgotar as tentativas o ciclo é considerado perdido. Se a Woovi expuser política de retry na criação da assinatura, usar a nativa e desligar a nossa; caso contrário, as retentativas ficam como tarefas agendadas nossas.

**2. Separar os dois motivos de falha**
- **Recuperável (sem saldo / limite)**: retentativas silenciosas + **um** aviso leve ("a cobrança não passou, vou tentar de novo nos próximos dias — não precisa fazer nada"). Nenhuma menção a reautorizar.
- **Terminal (mandato cancelado, rejeitado ou expirado no banco)**: sem retentativa; aí sim o fluxo de reautorização, porque o débito automático deixou de existir.

**3. Ofertas de retenção só depois das retentativas**
A escada (Lite, e Base em `/cancelar`) deixa de disparar em D+2/D+4 e passa a entrar **apenas quando as retentativas se esgotam** — ou seja, quando o cliente de fato ficou sem pagar o ciclo, não enquanto ainda estamos tentando debitar. O cancelamento do mandato continua sendo o último passo, contado a partir do fim das retentativas.

**4. Consertar o destino do aviso**
Adicionar caminho Woovi no `customer-portal` (cobrança PIX em aberto do ciclo → QR/link de pagamento avulso daquele ciclo), para que o botão do aviso resolva a pendência em vez de tentar abrir portal de cartão.

## Régua final proposta

```text
falha de ciclo (recuperável)
  H0    aviso leve: "não passou, vou tentar de novo"  + retentativa agendada
  D+1   retentativa 1 (silenciosa)
  D+3   retentativa 2 (silenciosa)
  D+6   retentativa 3 (silenciosa)
  D+7   esgotou: aviso 2 (com link do ciclo em aberto)
  D+9   oferta Lite
  D+12  último aviso + cancelamento do mandato

falha terminal (mandato cancelado/rejeitado no banco)
  H0    aviso de reautorização (mandato não existe mais)
  D+2   reenvio
  D+5   encerra e libera oferta de retenção
```

## Detalhes técnicos

- `supabase/functions/webhook-woovi/index.ts`: classificar o motivo em `handleUnpaidCycle` (recuperável vs terminal) e ramificar entre agendar retentativas e acionar reautorização; hoje ele agenda direto `dunning_pix_followup` em `[2,4,7]`.
- Novo `task_type` `woovi_cycle_retry` em `supabase/functions/execute-scheduled-tasks/index.ts`, que reemite a cobrança do ciclo via API Woovi e, se paga, cancela as tarefas pendentes do mesmo `payment_id` (mesma guarda "já pago" que o dunning atual usa).
- `criar-pix-recorrente-woovi`: enviar política de retry nativa se a API aceitar; documentar no código se não aceitar.
- `_shared/dunning-whatsapp.ts`: manter a escada, apenas mudar o gatilho (só após esgotar retentativas). Qualquer texto novo precisa de template aprovado no Twilio antes de valer em produção — a preferência é reaproveitar o aviso genérico já aprovado.
- `customer-portal`: novo branch Woovi lendo `woovi_charges` (`kind: cycle`, status em aberto).
- Nada disso rodou em produção ainda (`dunning_attempts` tem zero registros com `provider = 'woovi'`), então a validação será por simulação de evento de falha no webhook.