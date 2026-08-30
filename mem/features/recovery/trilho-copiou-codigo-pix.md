---
name: Trilho de recuperação "copiou o código PIX"
description: Régua única com dois trilhos exclusivos (genérico 15min vs copiou 20min/2h), gate por ContentSid aprovado em system_config.wa_copiou_templates
type: feature
---

- `checkout_sessions` ganhou `pix_copied_at`, `wa_copiou_20min_sent_at`, `wa_copiou_2h_sent_at`.
- `criar-pix-recorrente-woovi` devolve `checkoutSessionId`; o CheckoutV2 chama `mark-pix-copied` ao copiar o copia-e-cola (evento de funil é anônimo e não serve pra isso).
- Régua ÚNICA no `recover-abandoned-checkout-whatsapp`: trilho "copiou" roda ANTES do genérico; quem copiou fica fora do genérico de 15min (`pix_copied_at IS NULL` no seletor) e, ao receber a 1ª msg do trilho, o 15min é fechado com `skipped: trilho_copiou`. Os dois trilhos convergem no estágio de 24h.
- Gate: trilho fica DESLIGADO enquanto `system_config.wa_copiou_templates.m1` não tiver ContentSid aprovado pela Meta (Utility, {{1}} = nome, subconta de recuperação). `m2` habilita o 2º contato de 2h — sem template aprovado, o 2º contato não sai (fora da janela de 24h não há texto livre). **Regra do Eduardo: NUNCA liberar o trilho sem template novo criado, configurado e aprovado pela Meta antes.**
- Textos dos templates a submeter (rascunho aprovado pelo Eduardo, ajustar antes do envio à Meta):
  - **m1 (20min)** — nome sugerido `recuperacao_pix_copiado_20min`: "{{1}}, vi que você copiou o código do PIX por aqui. Se deu algum erro na hora de pagar ou travou no app do banco, me chama que eu te ajudo a destravar. Se foi só a correria do dia, seu código continua valendo — é só colar no app do banco e concluir. 💚" + botões quick reply: "Tive um erro" / "Vou pagar agora".
  - **m2 (2h)** — nome sugerido `recuperacao_pix_copiado_2h`: "{{1}}, passando pra avisar: seu PIX da Aura ainda está reservado. Se o código expirou ou apareceu 'tente mais tarde', eu gero um novo pra você na hora — é só responder aqui. 💚" + botões quick reply: "Gerar novo código" / "Já paguei".
- Validação sem envio: `POST recover-abandoned-checkout-whatsapp {"dryRun": true}` lista candidatos, trilho e motivo de skip sem enviar nada.
- Guardas compartilhadas intactas: cliente ativo, já pago, guarda Woovi ao vivo, cap de telefone 30d, cap de 3 falhas, quiet hours 22h-08h (só 2h/24h).
