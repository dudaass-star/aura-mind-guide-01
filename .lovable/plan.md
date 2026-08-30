# Trilho "Copiou o código PIX" — liberação travada até template aprovado

## Estado atual (já implementado)

- Trilho específico para leads que **copiaram o código PIX e não concluíram** já está implementado:
  - Colunas `pix_copied_at`, `wa_copiou_20min_sent_at`, `wa_copiou_2h_sent_at` em `checkout_sessions`.
  - Função `mark-pix-copied` (idempotente, anônima) chamada pelo checkout ao copiar o código.
  - Worker `recover-abandoned-checkout-whatsapp` com estágios opcionais `copiou_20min` e `copiou_2h`, mutuamente exclusivos com o genérico de 15min (uma régua só, dois trilhos nunca coexistem) e convergindo ao estágio de 24h.
  - Guardas compartilhadas mantidas: usuário ativo/pago, verificação Woovi ao vivo, cap por telefone, limite de falhas, quiet hours.
- Configuração `system_config.wa_copiou_templates` existe com `m1`/`m2` **nulos** — ou seja, o trilho está **desligado**. Enquanto estiverem nulos, nenhuma mensagem do trilho copiado é enviada; a régua genérica segue funcionando normalmente.

## Trava de liberação (o que o usuário exigiu)

1. **Não liberar o trilho sem template novo, aprovado pela Meta e configurado.**
2. Passos pendentes, nesta ordem:
   - Redigir o(s) template(s) WhatsApp (categoria Utility, subconta de recuperação, variável `{{1}}` = primeiro nome, quick replies) para os disparos de 20min e 2h.
   - Submeter à aprovação da Meta via Twilio e aguardar aprovação.
   - Cadastrar os `ContentSid` aprovados em `whatsApp templates` e em `system_config.wa_copiou_templates` (`m1` = 20min, `m2` = 2h).
   - O worker já valida o formato `HX...` do ContentSid e ignora estágios sem template válido — a trava é automática.
3. **Validação antes de ligar em produção:**
   - Rodar `POST recover-abandoned-checkout-whatsapp {"dryRun": true}` e conferir `copy_track_enabled: true` e os candidatos listados.
   - Dry-run nunca envia mensagem real nem marca registros.
4. Só após dry-run correto com templates cadastrados, o trilho passa a enviar de fato (nenhuma ação extra de "ligar" é necessária além de preencher os ContentSids — por isso o preenchimento é o último passo).

## Garantias

- Enquanto `m1`/`m2` estiverem nulos ou inválidos: zero envios do trilho copiado.
- Nenhum lead recebe trilho copiado + genérico juntos: o seletor do worker decide um único trilho antes de enviar.
- Nenhum envio real em testes.
