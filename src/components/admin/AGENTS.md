# Admin metrics

- Business charts use a dedicated admin-validated endpoint with paginated sources; this keeps daily billing and usage separate from legacy metric calculations.
- Billing plots group expected invoices by due date and receipts by payment date; this prevents late payments from being mistaken for same-cohort conversion.
- Billing refresh rereads every open Woovi mandate within a time budget (skipping settled and recently read ones) and treats any concluded try as paid; Woovi recurring debits often arrive without webhooks, so partial refreshes hid receipts.
- O avaliador de sessões usa `sessions.closure_mode='unilateral'` como sinal determinístico de interrupção pelo usuário; isso evita penalizar a condução da AURA por fechamento que dependia de respostas ausentes.
