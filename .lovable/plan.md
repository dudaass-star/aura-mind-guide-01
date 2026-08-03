# Caso Eduardo: "tá falando que mudou de número"

## O que aconteceu (verificado no banco)

- Perfil `Eduardo` (5512974013440) está **ativo**, plano Essencial, criado hoje 03/08 às 15:14 UTC (após a reconciliação do PIX órfão).
- Às **13:03** ele respondeu à conversa antiga: o WhatsApp exibiu o aviso de sistema "este número mudou" no contato salvo (o número antigo, da instância Z-API "Aura #1", que está `disconnected` desde hoje). Ele tocou no aviso e mandou mensagem para o número sugerido pelo WhatsApp — que não é o nosso número oficial e não tem webhook, então ninguém respondeu.
- Às **16:03** ele escreveu "Oi" no número oficial (Twilio +1 662 525 5005) e a AURA respondeu a mensagem de boas-vindas completa às **16:04**. `last_user_message_at` = 16:04 de hoje.
- Nenhum erro registrado em `failed_message_log` para o usuário.

Conclusão: não foi falha da AURA nem do pagamento. Foi o aviso nativo de "número mudou" do WhatsApp no contato antigo, que desviou o cliente para um número morto por ~3h. Já está conversando normalmente agora.

## Risco residual

A instância Z-API "Aura #1" ainda está marcada com 5 usuários ativos vinculados (Elizangela, Eduardo Santos, Ana Clara, Letícia, Clara) e está `disconnected`. Se algum deles escrever no número antigo, cai no mesmo vazio silencioso.

## Proposta (pequena, opcional)

1. Desvincular os 5 perfis da instância Z-API desativada (`whatsapp_instance_id = null`), para que todo envio saia pelo número oficial Twilio.
2. Marcar a instância "Aura #1" como inativa/arquivada no admin, evitando novas alocações por `allocate_whatsapp_instance()`.
3. No e-mail de boas-vindas e no portal, reforçar o link `wa.me/16625255005` como "número oficial da AURA — salve este contato", reduzindo chance de o cliente cair em contato antigo.

## Detalhes técnicos

- Item 1 e 2: migração SQL simples (update em `profiles` e `whatsapp_instances.status`), sem mudança de código de envio.
- Item 3: ajuste de texto em `supabase/functions/_shared/transactional-email-templates/welcome.tsx` e no aviso do portal (`PhoneLinkPrompt.tsx`).
- Nada a fazer no fluxo PIX/assinatura: ciclo pago até 03/09 e reautorização já coberta pelo fluxo D-2.
