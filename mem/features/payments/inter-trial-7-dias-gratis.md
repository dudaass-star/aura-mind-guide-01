---
name: Trial de 7 dias grátis no PIX Automático do Inter
description: No trilho Inter o trial mensal é 7 dias grátis (mandato cheio em D+7, sem cobrança imediata); modo controlado por system_config.inter_trial_mode
type: feature
---

O Inter só implementa a **Jornada 2** do Bacen: o QR da `rec` autoriza o mandato, e o `cob` ignora `idRec`. Não existe o QR composto "paga 6,90 + autoriza 29,90" do Asaas.

Regra vigente no Inter (substitui `mem/features/payments/pix-trial-semanal.md` no trilho Inter):

- `system_config.inter_trial_mode` = `free` (padrão) | `paid` | `none`, lido em `criar-pix-recorrente-inter`.
- `free`: nenhuma cobrança imediata (`cob` não é criado, sem ciclo 0), mandato com `valorRec` cheio e `dataInicial = hoje + 7`. Um único scan, uma aprovação.
- Acesso do trial grátis é liberado no `webhook-inter` quando o mandato vira `APROVADA`/`ATIVA` (não há dinheiro), com reserva idempotente em `inter_pix_recurrences.access_granted_at`; `activateAccess` dá 7 dias.
- O 1º débito cheio sai pelo `inter-pix-cycle-runner` como ciclo 1 (`cobr`), emitido em D-2 da `next_charge_date`.
- `paid` fica pronto para quando algum PSP publicar a Jornada 1; hoje exigiria dois scans.
- Trial só no mensal e só para cliente novo (`isReturningCustomer`).
- Resposta da função expõe `trialMode`, `trialDays` e `authorizationOnly`; o `CheckoutV2` mostra "7 dias grátis · nada é cobrado hoje" quando `authorizationOnly`.
