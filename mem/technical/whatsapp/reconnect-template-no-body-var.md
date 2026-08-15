---
name: Template reconnect não carrega texto — usar pending_insight
description: aura_reconnect_v2 (categoria reconnect) só tem a variável do primeiro nome; texto rico enviado por sendProactive fora da janela 24h chega como "Estou de volta! 💜 there"
type: constraint
---
Fora da janela de 24h, `sendProactive(phone, textoLongo, 'reconnect', userId)` NÃO entrega o texto: o template `aura_reconnect_v2` tem apenas a variável do primeiro nome. Se o `userId` estiver errado (ex.: passar `profiles.id` no lugar de `profiles.user_id`), o nome não resolve e o cliente recebe literalmente `Estou de volta! 💜 there`.

**Regra**: todo follow-up com link/texto rico deve, antes de disparar o template:
1. resolver `profiles.user_id` (por `profiles.id` e fallback por telefone);
2. gravar `pending_insight = '[CONTENT]' + texto` (entrega determinística no clique/resposta, via process-webhook-message);
3. só então chamar `sendProactive` com o `user_id` correto;
4. em falha, gravar em `failed_message_log`.

Aplicado em `woovi-pix-audit` (notify) e no aviso de mandato recusado do `webhook-woovi`.
