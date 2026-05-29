## Diagnóstico

Michele (`miantony3@gmail.com`) tem duas entradas em `checkout_sessions`:

- **30/abril** — plano Transformação, `status='completed'` (pagamento real). Assinatura `sub_1TRs9IQU15XnZ7Vv36Cusyo2` no Stripe, hoje **`canceled`**.
- **29/maio 07:35** — plano Essencial, `status='created'`, WhatsApp 15min disparado. **Sem pagamento.**

Ou seja, é uma ex-cliente que tentou voltar e abandonou. O painel marcou "Converteu" porque o badge de Resultado faz só:

```ts
// src/pages/AdminEngagement.tsx:427
converted: (s.email && completedEmails.has(s.email.toLowerCase())) || completedPhones.has(s.phone)
```

Existe QUALQUER `completed` com mesmo e-mail/telefone → vira "Converteu", sem comparar datas. Por isso o pagamento antigo de abril contamina o abandono de hoje. O contador agregado de WhatsApp (linhas 471-482) já compara `completedAt > firstSentAt` corretamente — o bug é só no flag por linha.

## Mudança

**`src/pages/AdminEngagement.tsx`** — substituir o cálculo de `converted` por linha (425-429) para exigir um `completed_at` (ou `created_at` do completed) **estritamente posterior** ao `created_at` da sessão abandonada. Os maps `completedAtByEmail` / `completedAtByPhone` já são montados acima (381-395) — só passar a usá-los:

```ts
const enriched = uniqueSessions.map(s => {
  const abandonedAt = new Date(s.created_at).getTime();
  const latestCompletedAt = Math.max(
    s.email ? (completedAtByEmail.get(s.email.toLowerCase()) || 0) : 0,
    s.phone ? (completedAtByPhone.get(s.phone) || 0) : 0,
  );
  return {
    ...s,
    converted: latestCompletedAt > abandonedAt,
    attempt_status: attemptMap.get(s.id) || null,
  };
});
```

Sem mudanças em backend, schema, RLS, edge functions ou no contador agregado do card.

## Validação

1. Recarregar `/admin/engajamento` → seção Recuperação de Checkout Abandonado.
2. Linha da Michele (29/05 07:35) passa a mostrar **"Não voltou"**.
3. Card-resumo do WhatsApp ("5 converteram") permanece igual.
4. Quem realmente pagou *depois* do abandono continua aparecendo como "Converteu".

## Fora de escopo

Funil cartão+PIX, RecoveryInbox, edge functions, migrations.
