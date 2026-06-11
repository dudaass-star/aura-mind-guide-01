## Contexto

A infraestrutura Meta Cloud API já está 100% pronta no código:

- `_shared/meta-whatsapp-client.ts` espelha todas as funções de envio (texto, áudio, template, proativo)
- `_shared/whatsapp-provider.ts` já roteia por `system_config.whatsapp_provider` e tem fallback Meta→Twilio em qualquer erro
- Templates Meta já cadastrados em `whatsapp_templates.meta_template_name` para a maioria das categorias

O que falta é só o **flip do switch global** + verificações de segurança.

## Estado atual

| Item | Hoje | Após plano |
|---|---|---|
| Inbound | webhook-meta (novo número) ✅ | webhook-meta (novo número) |
| Outbound texto livre | Twilio `+16625255005` | Meta `+15559586099` |
| Outbound áudio | Twilio | Meta |
| Outbound proativo | Twilio template | Meta template, fallback Twilio em erro |
| `system_config.whatsapp_provider` | `official` (=Twilio) | `meta` |

## Plano

### 1. Flip do provider global

Migration `update`: `system_config.whatsapp_provider = 'meta'`. Isso ativa o branch `meta` em `getProvider()` no `whatsapp-provider.ts`, que já roteia tudo (texto, áudio, proativo, template forçado) para `meta-whatsapp-client.ts`.

### 2. Garantir checkin Meta ativo

A categoria `checkin` está com `meta_template_name = 'cheking_7dias2'` e `is_active = false`. Como `cheking_7dias` é o único check-in proativo aprovado segundo a memória, preciso confirmar com você antes de mexer:

- Ativar `cheking_7dias2` (se já aprovado pela Meta no WABA novo)?
- Ou trocar `meta_template_name` para o nome aprovado no WABA novo (`cheking_7dias`)?

Categorias sem `meta_template_name` (`reconnect`, `checkout_recovery_*`) continuam caindo pro fallback Twilio automaticamente — não bloqueia o flip.

### 3. Validação imediata pós-flip

Você manda outra mensagem pro `+1 555-958-6099` e eu verifico em `process-webhook-message` logs:

- `📨 [Meta] Sending free text` em vez de `[Twilio]`
- `wamid:` retornado pelo Graph (em vez de `SID:`)
- Mensagem chega no seu WhatsApp **vinda do mesmo número novo**

### 4. Plano de rollback

Se algo quebrar (ex: token Meta sem permissão `messages` para o phone_number_id novo, template ainda não aprovado num caso específico): basta reverter `system_config.whatsapp_provider` para `official` via 1 update. O fallback Meta→Twilio já cobre erros transientes sem precisar de rollback global.

## Detalhes técnicos (referência)

- Phone number ID alvo: `1102172772986795` (env `META_WHATSAPP_PHONE_NUMBER_ID` já está)
- WABA: `4389879528007597` (`META_WHATSAPP_BUSINESS_ACCOUNT_ID`)
- App "Ola Aura 2" já inscrito no WABA (passo concluído na turn anterior)
- Token: `META_WHATSAPP_ACCESS_TOKEN` (já válido — webhook-meta valida assinatura com sucesso)
- Memória `mem://technical/whatsapp/integration-provider-status` e `mem://technical/whatsapp/official-number-config` precisarão ser atualizadas após cutover

## Pergunta antes de implementar

Sobre o template `checkin` na seção 2 — qual o nome exato aprovado no WABA novo? Posso seguir com flip mesmo se `checkin` continuar inativo (só o check-in 7 dias proativo para de funcionar; tudo o mais opera normal).
