# PIX Automático: cobrar R$ 29,90 no 8º dia (trial real de 7 dias)

## Estado atual (verificado no código)
- `criar-pix-recorrente-woovi` cria o mandato com `dayGenerateCharge = hoje + 1 mês` e `next_charge_date` também em +1 mês. Ou seja: quem paga R$ 6,90 hoje só é debitado em **13/09** — 30 dias depois, exatamente como aparece no print.
- `webhook-woovi` libera `plan_expires_at = base + 1 mês` na ativação, com comentário explícito de que "não existe janela de 7 dias".
- Conclusão: a promo hoje é "1º mês por R$ 6,90", e a copy "1ª semana" está errada.

## O que muda
```text
hoje  → R$ 6,90 + mandato com 1º débito em D+30 (acesso 30 dias)
novo  → R$ 6,90 + mandato com 1º débito em D+7  (acesso 7 dias, estendido no débito)
```

1. **Criação do mandato** (`criar-pix-recorrente-woovi`)
   - No caminho composto com promo: `dayGenerateCharge` e `next_charge_date` passam a ser **hoje + 7 dias** (folga confortável sobre o mínimo de 2 dias do arranjo Pix).
   - Ciclos seguintes continuam mensais a partir dessa data (débito no dia 8, depois todo mês na mesma data).
   - Ciclos longos (Tri/Sem/Anual) e reautorização/ofertas não mudam.

2. **Ativação e validade** (`webhook-woovi`)
   - Pagamento de entrada com `is_trial`: `plan_expires_at = hoje + 7 dias` (em vez de +1 mês).
   - O débito recorrente confirmado no 8º dia estende para o ciclo mensal normal, somando ao saldo restante — continua contando como renovação, não venda nova.

3. **Copy do checkout** (`CheckoutV2.tsx` e modal do QR)
   - Mantém "1ª semana R$ 6,90 · depois R$ 29,90/mês", agora com a data real de D+7 vinda de `firstRecurringChargeDate` — a data exibida deixa de ser 30 dias à frente.

4. **Recuperação e dunning**
   - A falha do 1º débito (dia 8) é o momento de maior risco: confirmar que a recuperação silenciosa de ~30 dias e a escada final (30% off → Lite) tratam esse ciclo como qualquer outro, sem tratar o cliente como venda nova.

## Riscos honestos
- Alguns apps de banco exibem o mandato de forma mais conservadora quando o 1º débito é próximo; a data D+7 respeita a janela mínima, mas vale um QR de teste antes de considerar validado.
- Mandatos já autorizados **não** mudam: quem assinou até hoje continua com débito em D+30. A mudança vale só para novos QRs.

## Detalhes técnicos
Arquivos: `supabase/functions/criar-pix-recorrente-woovi/index.ts` (helper `addDays` para o caso trial), `supabase/functions/webhook-woovi/index.ts` (validade de 7 dias quando `is_trial` e o pagamento é a entrada), `src/pages/CheckoutV2.tsx` (data exibida no resumo e no modal).
