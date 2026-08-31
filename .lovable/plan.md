# Ligar o trilho "copiou o código PIX" com os templates aprovados

Os dois templates estão aprovados na subconta de recuperação, com quick reply e "Olá {{1}}" (variável fora das pontas — foi isso que derrubou a versão anterior):

- 15 min — `copy_of_recuperacao_pix_copiaecola_15min` — `HX438035e6d8892b4463e99b6abfaad832` — botões: Ficou uma dúvida / Vou pagar agora / Tive um erro
- 2 h — `copy_of_recuperacao_pix_copiaecola_2hs` — `HX8a208cd323ef2b99c92790caa0118b25` — botões: Gerar novo código / Já paguei / Tenho uma dúvida

## O que fazer

1. **Ligar o trilho**: gravar os dois SIDs em `system_config.wa_copiou_templates` (`m1` = 15 min, `m2` = 2 h). O worker já valida o formato `HX...` e só liga o 2º contato quando `m2` existe. Registrar também os dois templates em `whatsapp_templates` para o painel de admin refletir os SIDs ativos.

2. **Ajustar a janela do 1º contato para 15 min**: o estágio hoje se chama `copiou_20min` e dispara 20 minutos após `pix_copied_at`. O template aprovado é o de 15 min — alinhar o atraso para 15 minutos (mantendo o nome interno da coluna, para não perder histórico) e o 2º em 2 h.

3. **Tratar os cliques de botão no `recovery-agent`**: os cliques chegam no `webhook-twilio-recovery` como texto (`ButtonText`), já gravado como inbound. Adicionar roteamento determinístico antes do LLM:
   - "Gerar novo código" / "Tive um erro" → busca a `checkout_sessions` do telefone, confere ao vivo na Woovi se já pagou (guarda existente), reaproveita a cobrança se ainda válida ou gera nova via `criar-pix-recorrente-woovi`, e responde com o copia-e-cola. Uma geração por conversa/hora.
   - "Já paguei" → checagem ao vivo; se pago, confirma acesso e não oferece nada; se não achou, cai no modo suporte.
   - "Ficou uma dúvida" / "Tenho uma dúvida" / "Vou pagar agora" → segue para o agente conversacional já reposicionado (encanta, não se diminui), com o contexto de que a pessoa copiou o código e travou.

4. **Validar sem enviar nada**: `POST recover-abandoned-checkout-whatsapp {"dryRun": true}` para conferir candidatos, trilho escolhido e motivos de skip; depois um envio real controlado para o seu número antes de liberar em produção.

## Detalhes técnicos

- `loadCopyStages()` já é o gate: sem SID válido o trilho fica desligado, então o passo 1 é o que efetivamente liga.
- Régua única preservada: quem tem `pix_copied_at` sai do genérico de 15 min (`skipped: trilho_copiou`) e os dois trilhos convergem no estágio de 24 h.
- Guardas compartilhadas intactas: cliente ativo, já pago, guarda Woovi ao vivo, cap de telefone 30 d, cap de 3 falhas, quiet hours 22h–08h BRT.
- Categoria dos templates ficou Marketing (aprovados assim); nada a mudar agora, mas se a Meta apertar entrega, resubmeter como Utility é o caminho.
- Atualizar `mem/features/recovery/trilho-copiou-codigo-pix.md` com os SIDs ativos, os textos finais e o roteamento de botões.
