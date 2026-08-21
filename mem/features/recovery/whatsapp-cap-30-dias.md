---
name: Cap de recuperação WhatsApp por janela de 30 dias
description: Cap por telefone é de 30 dias (não vitalício) e falha de infraestrutura nossa nunca bane o número
type: feature
---

Caso Maria Aparecida (20/08/2026, checkout 19:38 BRT, PIX não pago): não recebeu o lembrete de 15min porque o telefone estava banido **vitaliciamente** por 3 falhas `Authenticate` de 20/05 (credencial errada da subconta Twilio) e por 2 envios de maio. Erro nosso queimou uma lead nova.

Regras atuais em `recover-abandoned-checkout-whatsapp/index.ts`:

- **Cap por janela**: contagem de `recovery_messages` (out, não-admin) limitada aos últimos **30 dias**; 2+ mensagens na janela pula o telefone. Lead que volta meses depois é oportunidade nova. Motivo logado como `phone_window_cap`.
- **Classificação de falha** (`isInfraFailure`): erros nossos (`Authenticate`, `could not find a Channel`, `Invalid Parameter`, `unauthorized`, 5xx, timeout, template/ContentSid não encontrado) **não banem** o número. Só banem falhas atribuíveis ao número/usuário (número inválido, destinatário inexistente, opt-out).
- Passivo histórico reclassificado: tentativas com erro de infraestrutura viraram `wa_stage_{1,2}_infra_error` (saem do `like 'wa_%failed'`). Telefones banidos por falha caíram de **86 → 21**.
- `AdminEngagement.tsx` → `SKIP_LABELS` traduz `phone_window_cap`, `woovi_mandate_remote/local` e `infra_error` para linguagem de negócio.

Gatilhos (15min / 24h) e templates aprovados permanecem inalterados.
