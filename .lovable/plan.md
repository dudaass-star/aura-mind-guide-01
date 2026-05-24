# Retestar envio agora que o sender +19123014009 está Online

## Contexto
- Print do console Twilio mostra o sender **+19123014009 / Aura Infos** com status **Online** na subaccount **OLAAURA3**.
- Erro anterior 63007 ("Channel not found") deve ter sido por o sender ainda não estar provisionado no momento do teste.

## Plano

### 1. Disparar novo teste pro seu número
- Chamar `POST /test-whatsapp-recovery` com `{"phone":"51981519708","name":"Gustavo","stage":"15min"}`.
- Anotar o novo `messageSid`.

### 2. Conferir status final
- Chamar `POST /test-whatsapp-recovery-status` com o novo `messageSid`.
- Cenários:
  - **`status: delivered` / `sent`** → tá funcionando, fim. Confere no celular.
  - **Erro 63007 de novo** → significa que a subaccount no `TWILIO_RECOVERY_ACCOUNT_SID` (AC12d36bc4c5b4a426fdbc483580adaac5) é DIFERENTE da subaccount "OLAAURA3" onde o sender está. Aí precisamos atualizar `TWILIO_RECOVERY_ACCOUNT_SID` e `TWILIO_RECOVERY_AUTH_TOKEN` pra apontar pra OLAAURA3.
  - **Erro 63016 / 63051** → templates `HX7ae71f...` / `HXb34b27...` não estão linkados ao novo WABA; precisam ser reaprovados/relinkados no Content Template Builder.

### 3. Após sucesso
- Sem mais ação. O cron de produção volta a entregar normalmente nos próximos checkouts abandonados.

Sem mudanças de código — só re-uso dos endpoints de teste já existentes.
