Objetivo
--------
Descobrir **por que a conversão despencou nos últimos 3–4 dias** (de 25–66% para 0–13%) antes de mexer em qualquer coisa. As mudanças de ontem no `CheckoutV2` (stepper, trust signals, microcópia, Embedded Checkout) são a hipótese principal — mas precisamos confirmar com dados, não suposição.

Contexto observado
------------------
- 14 dias de dados: 22 sessões/dia em média.
- **Quebra clara em 19/mai**: dias anteriores convertiam 25–66%, dias seguintes 0–13%.
- Plano "Direção" concentra 60% do tráfego — qualquer regressão nele dói desproporcionalmente.
- Stripe mostra muitos PaymentIntents em `requires_payment_method` (cartão recusado/abandonado no widget) misturados com sucessos.
- Não existe tabela `payment_attempts` no banco — só temos `checkout_sessions` (criado/completado) e PaymentIntents do Stripe.

---

### Passo 1 — Quantificar onde está o vazamento (1 query)

Cruzar `checkout_sessions` x PaymentIntents do Stripe para os últimos 14 dias e classificar cada sessão em um de 4 baldes:

```text
[A] Criou sessão → nunca abriu widget Stripe          (zero PI)
[B] Abriu widget → nunca submeteu cartão              (PI em requires_payment_method, sem charge)
[C] Submeteu cartão → recusado/3DS falhou             (PI failed/canceled com last_payment_error)
[D] Pagou                                              (PI succeeded)
```

Hoje só sabemos A+B+C juntos ("abandonaram"). Separar isso é o que diz se a alavanca certa é:
- **A grande** → problema é confiança/UX **antes** do widget (form, copy, percepção de pegadinha)
- **B grande** → problema é dentro do widget Stripe (algo no Embedded está travando, talvez mobile)
- **C grande** → problema é aceitação de cartão (PIX, 3DS, antifraude)

Comparar a distribuição A/B/C/D entre o período "saudável" (08–18/mai) e o "quebrado" (19–22/mai). A categoria que cresceu é a culpada.

---

### Passo 2 — Investigar a hipótese principal (regressão do deploy)

Em paralelo ao Passo 1:

1. Ler o histórico de mudanças do `CheckoutV2.tsx` dos últimos 3 dias (stepper, trust signals, microcópia, switch para EmbeddedCheckout).
2. Testar o fluxo completo em **mobile real 390x844** (Safari iOS + Chrome Android), porque é onde 70%+ do tráfego está e onde regressões silenciosas mais machucam:
   - Form preenche normal?
   - Widget Stripe carrega? Demora? Some?
   - Botão "Pagar" do widget aparece e funciona?
   - Há erro silencioso no console?
3. Conferir `edge function logs` da `create-checkout` no período da queda — taxa de erro, latência.
4. Conferir GA4 events `add_payment_info` x `purchase` no mesmo período (se `add_payment_info` continua disparando mas `purchase` caiu, confirma que é dentro do widget).

---

### Passo 3 — Decidir a alavanca certa

Só depois dos passos 1 e 2, apresentar um plano de correção que ataca **a causa identificada**, não chutes:

- Se for regressão do deploy → reverter a mudança específica.
- Se for problema dentro do widget Embedded em mobile → considerar voltar para `redirect mode` do Stripe nesse breakpoint.
- Se for cartão recusado → aí sim faz sentido habilitar PIX e/ou ajustar 3DS.
- Se for problema de confiança antes do widget → microcópia, prova social inline, garantia mais forte.

---

Não-objetivos desta rodada
--------------------------
- **Não** mexer no Stripe Dashboard (PIX, Apple Pay domain).
- **Não** mudar oferta/preço.
- **Não** adicionar features novas no `/v2/checkout`.
- **Não** mexer em edge functions.

Entregável final do diagnóstico
-------------------------------
Um resumo em 5 linhas com:
- Distribuição A/B/C/D nos dois períodos
- Causa mais provável da queda
- 1 ação corretiva específica (não 4 alavancas genéricas)
- Estimativa de impacto
- Risco da correção

A partir desse resumo, abrimos uma rodada de implementação focada.
