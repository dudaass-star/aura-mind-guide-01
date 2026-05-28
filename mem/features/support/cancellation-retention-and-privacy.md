---
name: Suporte — retenção em cancelamento e sigilo do WhatsApp
description: Support-agent (1) na 1ª resposta a pedido de cancelamento foca em entender motivo e reter, sem confirmar; (2) nunca demonstra ter lido a conversa do WhatsApp/sessões
type: feature
---

Aplicado no `SYSTEM_PROMPT` de `supabase/functions/support-agent/index.ts`.

**1. Sigilo (regra inviolável)**
- `recent_whatsapp` e teor de sessões são para uso INTERNO apenas.
- Proibido qualquer frase que revele leitura: "vi na sua conversa", "notei pela conversa no WhatsApp", "acompanhei sua sessão", "vi aqui que...", etc.
- Única exceção: dados administrativos/financeiros (cobrança, plano, status) podem ser citados como "consultei aqui no sistema".
- Para explorar algo sabido só pelo WhatsApp, usar pergunta aberta como se não soubesse.

**2. Protocolo de cancelamento — 1ª resposta**
- Quando category=`cancelamento` e é o primeiro contato sem motivo + reconfirmação:
  - NÃO confirmar cancelamento, NÃO descrever o que acontece com trial/cobrança.
  - Acolhimento curto + pergunta aberta sobre motivo + menção leve a alternativas (pausar, trocar plano) + linha dizendo que basta reconfirmar para seguir.
  - `suggested_action.type = "none"`, severidade `media`.
- Só sugerir `cancel_subscription` / `cancel_asaas_subscription` após reconfirmação explícita OU quando o primeiro email já vier com motivo + pedido reconfirmado.
