---
name: Resolução de acesso ao portal no suporte
description: Tickets de acesso ao /meu-espaco usam send_portal_link com URL pública estática; portal não usa mais token UUID
type: feature
---

# Acesso ao portal nos tickets de suporte

- O portal `/meu-espaco` mudou: **não usa mais token UUID na URL**. Login é direto via Google ou OTP de 6 dígitos por email (ver `PortalLogin.tsx` + `PortalAuthContext`).
- Em `support-agent` (SYSTEM_PROMPT), tickets de "não consigo entrar / esqueci senha / como acesso / quero ver minhas sessões no portal" **devem** retornar `suggested_action.type = "send_portal_link"` e o draft **deve** conter literalmente `https://olaaura.com.br/meu-espaco` (sem placeholder, sem `?t=...`).
- Sempre orientar: "entre com o mesmo email da conta — Google ou código por email". Não há senha.
- Em `support-execute-action`, o case `send_portal_link` não toca mais em `user_portal_tokens` — só devolve a URL pública estática. Tabela `user_portal_tokens` continua existindo para outros usos (admin link, customer-portal), mas não para suporte.
- Proibido redirecionar cliente pro WhatsApp pra resolver acesso ao portal.