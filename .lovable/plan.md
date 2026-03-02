

# Diagnostico e Plano

## Relatorio Semanal (01/03)

O relatorio **foi gerado e registrado** no banco em 01/03 as 19:00 BRT. O codigo so salva na tabela `messages` se `result.success` retorna `true` da Z-API -- ou seja, a Z-API **confirmou o envio**. Porem, voce nao recebeu. Possiveis causas:

1. **Z-API reportou sucesso mas nao entregou** (problema intermitente da Z-API)
2. **Mensagem muito longa** -- o relatorio tem ~800+ caracteres com formatacao, pode ter sido truncado ou bloqueado

Nao consigo confirmar qual foi o problema pois os logs da edge function nao estao mais disponiveis (ja passaram >24h). Posso **reenviar o relatorio agora** como teste para confirmar que a entrega funciona.

## Reengajamento Semanal

### Situacao atual
- Seu `conversation_followups` tem `last_user_message_at = null` e `followup_count = 0`
- Sua ultima mensagem foi em 22/02 (8 dias atras)
- O sistema ignora registros com `last_user_message_at = null` (conversa encerrada com tag `[CONVERSA_CONCLUIDA]`)
- **Nao existe** mecanismo para reengajar usuarios inativos

### Implementacao

Adicionar um bloco de **reengajamento por inatividade** na funcao `conversation-followup`, que ja roda diariamente as 10h:

1. **Query adicional**: Buscar profiles ativos cujo ultimo `role: 'user'` em `messages` foi ha mais de 7 dias
2. **Controle de frequencia**: Verificar `last_followup_at` no `conversation_followups` -- so enviar se ultimo follow-up foi ha mais de 7 dias
3. **Mensagem contextual via IA**: Gerar mensagem baseada na jornada atual do usuario, ultimo tema conversado e insights salvos (nao generica)
4. **Registrar envio**: Atualizar `last_followup_at` e salvar mensagem em `messages`
5. **Respeitar travas**: DND, quiet hours, sessao ativa, mensagem recente nos ultimos 10min

### Detalhes tecnicos

- Modificar `supabase/functions/conversation-followup/index.ts`
- Apos o loop existente de follow-ups de conversa, adicionar novo bloco:
  - Query: `profiles` com `status = 'active'`, join com `messages` para pegar data da ultima msg do usuario
  - Filtro: ultima mensagem do usuario > 7 dias atras
  - Filtro: `last_followup_at` em `conversation_followups` > 7 dias atras (ou null)
  - Gerar mensagem via Lovable AI com contexto da jornada e ultimas conversas
  - Enviar via Z-API e registrar

