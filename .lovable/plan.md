# Lúcia disse "Quero" e recebeu link de assinatura em vez do código de R$ 6,90

## O que aconteceu, na ordem

Pelo histórico dela (06/09, 18:45–18:49 BRT):

1. Ela clicou em "Ficou uma dúvida" e perguntou "É 9,90?".
2. O agente respondeu certo, mas passou a oferecer, por conta própria, "o QR Code de R$ 6,90" — em texto solto, três vezes, chamando isso de "primeira semana do Essencial".
3. Ela disse "Quero".
4. O sistema reconheceu o "Quero" como aceite, mas **não achou nenhuma oferta oficial do encontro de R$ 6,90 registrada** para o número dela — então não gerou código nenhum.
5. Sem geração, a resposta ficou na mão do modelo: ele prometeu "te mando um novo código Pix agora mesmo" e o sistema colou o link do checkout de assinatura no fim. Nada de código, nada de página de PIX.

Ou seja: o "Quero" caiu no vão entre uma oferta improvisada pelo modelo e o gerador oficial, que só aceita ofertas oficiais.

## Por que o gerador recusou

A checagem de "a oferta já saiu?" só reconhece dois rastros: a marca gravada quando o agente oferece pela via oficial, ou uma mensagem que cite ao mesmo tempo "6,90" **e** "45 minutos". As três ofertas da Lúcia falavam de R$ 6,90 e de "uma semana do Essencial" — não bateram em nada. Some-se a isso: o modelo prometeu mandar código, o que ele não tem autoridade nenhuma para fazer.

## O que corrigir

1. **O modelo não promete pagamento que ele não gera.** Proibir explicitamente frases do tipo "te mando o código/QR Code agora" quando a oferta oficial do encontro não estiver autorizada nesta mensagem — com rede de segurança removendo a promessa se ela aparecer.
2. **Não confundir o encontro de R$ 6,90 com semana do Essencial.** São coisas diferentes: o encontro avulso é pagamento único, PIX comum; a semana é assinatura com autorização. O agente passou a conversa inteira misturando os dois.
3. **Aceite não morre por rastro frouxo.** Quando o "Quero" vier logo depois de uma mensagem nossa que ofereceu R$ 6,90 (em qualquer redação), tratar como aceite válido do encontro e chamar o gerador — a elegibilidade continua sendo decidida pelo backend, que é quem barra cliente ativo, ex-assinante, já pago, etc.
4. **Nunca terminar em link de assinatura quando a mensagem prometeu código.** Se o texto fala de código/QR de R$ 6,90 e não há código real, a mensagem não sai com o link do checkout: ou sai com o link do PIX gerado, ou sai perguntando de forma honesta.
5. **Responder a Lúcia agora**, gerando o link real de R$ 6,90 pra ela (ela está com janela de 24h aberta e disse "Quero").

## Detalhes técnicos

- `supabase/functions/recovery-agent/pix-buttons.ts`
  - `tasterOfferAlreadySent`: além dos rastros atuais (`metadata.taster_offered`, `template === "copiou_taster"`, corpo com "6,90" + "45 minutos"), aceitar corpo outbound recente (últimas 12 mensagens) que cite `6,90`/`R$ 6,90` como oferta de experimentação. Mantém a exigência de ser mensagem **nossa** (`direction = out`).
  - `RE_SHORT_ACCEPT` já cobre "Quero" — sem mudança.
- `supabase/functions/recovery-agent/index.ts`
  - `tasterInstruction`: reforçar que o encontro avulso **não** é "primeira semana do Essencial" e que é proibido prometer envio de código/QR sem emitir `[OFERECER_TASTER]`.
  - Nova rede de segurança pós-geração: se `body` contém promessa de código/QR (`/(mando|gero|envio).{0,30}(c[oó]digo|qr)/i`) e não houve geração determinística (`!offerTaster`), remover a promessa; se o resto ficar curto, trocar por pergunta direta ("quer que eu gere o encontro de R$ 6,90 agora?").
  - Bloquear `CHECKOUT_URL` quando o corpo menciona R$ 6,90 + código/QR: o link de assinatura nunca fecha uma mensagem de encontro avulso.
  - Sem mudança em `criar-pix-taster`, `taster.ts`, travas, templates, dunning ou schema.
- Deploy: `recovery-agent` (e só ele).

## Validação

- `POST recovery-agent {"preview": true, "phone": "<lúcia>", "text": "Quero"}` deve retornar caminho determinístico do taster ou, na falta de elegibilidade, uma resposta sem link de assinatura e sem promessa de código.
- Simular a sequência "É 9,90?" → oferta em texto → "Quero" e conferir que o segundo passo gera o link `/pix/<token>`.
- Conferir em `recovery_messages` que nenhuma mensagem com "6,90" sai com `/v2/checkout`.
