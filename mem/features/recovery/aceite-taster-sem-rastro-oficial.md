---
name: Aceite do encontro R$ 6,90 não morre por redação da oferta
description: Caso Lúcia (06/09/2026) — "Quero" após oferta improvisada pelo modelo não gerava código e a mensagem saía com link de assinatura
type: feature
---

**Caso Lúcia (5511972391446, 06/09/2026):** o modelo ofereceu "o QR Code de R$ 6,90" com redação própria (chamando de "primeira semana do Essencial", sem a tag `[OFERECER_TASTER]`). Ela respondeu "Quero"; `classifyTasterIntent` deu `short_accept`, mas `tasterOfferAlreadySent` exigia rastro oficial (metadata) ou corpo com "6,90" **e** "45 minutos" → recusou. Caiu no LLM, que prometeu "te mando um novo código Pix agora mesmo" e o pipeline colou `/v2/checkout` no fim. Zero código gerado.

**Correções (recovery-agent):**
- `tasterOfferAlreadySent` também aceita corpo outbound recente com `6,90` + qualquer sinal de oferta (`código|qr code|pix|experimentar|gerar|gero|mando`). Elegibilidade continua 100% no `criar-pix-taster`.
- `tasterInstruction`: proibido descrever o encontro avulso como "primeira semana do Essencial"/plano/assinatura; proibido prometer envio de código sem emitir `[OFERECER_TASTER]`.
- Rede de segurança `RE_PROMISE_CODE`: promessa de mandar código/QR sem geração determinística é removida da mensagem (fallback: "Quer que eu gere o encontro guiado de R$ 6,90 agora?").
- Mensagem que menciona `6,90` nunca sai com link de assinatura (`sendLink = false`).
- Nota operacional: `auto_reply_count` (max_auto_replies) pode bloquear reenvio manual — resposta vem como `skipped: limit_reached`.
