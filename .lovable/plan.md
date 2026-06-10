## Diagnóstico

Olhando o banco da aba **Mensagens → Recuperação**:

- **68 conversas** no total
- **10 com resposta do lead** (`last_inbound_at` preenchido)
- **8 dessas estão "não lidas"** → é exatamente o número do badge `8`
- **58 conversas só receberam o template e nunca responderam** — todas com o mesmo preview "[Template 24h] Olá X, finalize sua assinatura."

Por isso a lista parece toda igual: ela mistura os 58 "só envio" (todos com texto idêntico) com as 10 que de fato responderam. As 8 que importam para o badge ficam afogadas no meio.

O `RecoveryInbox` hoje:
- Lista as 200 conversas mais recentes sem filtro
- Só destaca com badge "novo" as não lidas — funciona, mas some no meio das outras
- Não mostra em qual **estágio** de recuperação o envio está (1/2/3)
- Quando o lead responde, o preview ainda fica dominado pelo último template enviado pela Aura (porque a `recovery-agent` reescreve `last_message_preview` com a resposta automática)

## O que vou ajustar (apenas frontend, em `RecoveryInbox.tsx`)

1. **Filtros no topo da lista** (chips/segmented):
   - `Não lidas (8)` — default quando houver pelo menos uma
   - `Responderam (10)` — todas com `last_inbound_at`
   - `Só envio (58)` — nunca responderam
   - `Todas (68)`
   Contagens calculadas em memória sobre `conversations`.

2. **Preview mais informativo**:
   - Se a conversa tem `last_inbound_at`, mostrar o preview prefixado com `↩ Lead:` e o texto da última mensagem **inbound** (busca no `recovery_messages` mais recente com `direction='in'`, com cache local por telefone) em vez do `last_message_preview` que pode ter virado a auto-resposta da Aura.
   - Se nunca respondeu, manter o preview atual mas adicionar um chip de **Estágio 1/2/3** ao lado do nome, lendo de `checkout_sessions.recovery_stage` via join leve (uma query única `in('id', [...])` quando a lista carrega).

3. **Destaque visual dos não lidos**:
   - Linha com fundo levemente colorido (`bg-primary/5`) e nome em `font-semibold` quando `unread`.
   - Badge atual "novo" mantido, mas mais visível (cor primária).
   - Para conversas com resposta já lida, badge cinza `respondeu` no lugar.

4. **Ordenação consciente do filtro**:
   - Em "Não lidas" e "Responderam", ordenar por `last_inbound_at desc` (foca no que precisa de atenção).
   - Em "Só envio" e "Todas", manter ordenação atual por última atividade.

5. **Contador correto no badge da aba**: o `AdminMessages.tsx` já calcula corretamente (8 = não lidas com inbound). Não mexer nele.

## Fora de escopo

- Não vou mexer em edge functions, schema, nem em como a `recovery-agent` grava o preview. Se depois quisermos parar de sobrescrever `last_message_preview` no auto-reply, faço numa etapa separada.
- Nada de mudança no `whatsapp-recovery-admin-reply` ou no webhook.

## Validação após implementar

- Abrir `/admin/mensagens?tab=recuperacao`
- Conferir: filtro "Não lidas" mostra exatamente 8 itens, "Responderam" mostra 10, "Só envio" 58.
- Conferir: a conversa do "Geow!" mostra `↩ Lead: Como fuciona?` no preview.
- Conferir: as conversas só-envio mostram o chip `Estágio 1` (ou 2/3) ao lado do nome.
