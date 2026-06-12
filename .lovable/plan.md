## Plano: corrigir PIX recorrente para PIX Automático Bacen

Você está certo: a conta Asaas está habilitada, mas o código atual ficou preso no modelo antigo (`/subscriptions` + `billingType: "PIX"`). Isso gera QR recorrente manual, não débito automático autorizado no banco.

### Objetivo

Fazer novos checkouts PIX usarem PIX Automático Bacen de verdade: o cliente autoriza uma vez no app do banco, e as próximas cobranças acontecem automaticamente.

### Etapas

1. **Ajustar o checkout PIX**
   - Trocar o fluxo de `criar-pix-recorrente-asaas` para criar uma autorização PIX Automático.
   - A UI deixa de tratar esse fluxo como “gerar QR recorrente” e passa a orientar: “autorize no app do banco”.
   - Manter QR/copia-e-cola apenas como fallback se o Asaas retornar um pagamento imediato junto da autorização.

2. **Persistir a autorização PIX Automático**
   - Criar estrutura no banco para guardar a autorização: `authorizationId`, customer, plano, ciclo, valor, status, payload bruto e vínculo com profile.
   - Preservar `asaas_payments` para cobranças/pagamentos efetivos.
   - Incluir `GRANT` + RLS corretamente na migration.

3. **Atualizar o webhook Asaas**
   - Tratar eventos `PIX_AUTOMATIC_*` além de `PAYMENT_*`.
   - Quando autorização for aprovada/ativa, marcar a assinatura PIX Automático como ativa.
   - Quando um pagamento automático for confirmado, reutilizar a lógica atual de ativação/renovação do profile.
   - Quando autorização for cancelada/rejeitada/expirada, atualizar status e evitar acesso indevido.

4. **Adaptar troca de plano PIX**
   - Parar de criar nova `/subscriptions` clássica em `change-asaas-plan`.
   - Para PIX Automático, cancelar/substituir a autorização anterior conforme o suporte da API e criar uma nova autorização para o próximo ciclo.
   - Se houver cobrança vencida, manter o bloqueio atual.

5. **Legado sem quebrar clientes atuais**
   - Não apagar as 32 subscriptions clássicas existentes agora.
   - O webhook continua aceitando `PAYMENT_*` das subscriptions antigas para não interromper renovações em andamento.
   - Depois da migração dos novos checkouts, fazemos um plano separado para migrar os clientes antigos com comunicação apropriada, porque PIX Automático exige consentimento no banco.

6. **Validação pós-implementação**
   - Rodar teste controlado da edge function em modo read/write mínimo com dados de teste ou payload real aprovado.
   - Verificar logs do webhook para eventos `PIX_AUTOMATIC_*`.
   - Confirmar no banco: autorização criada, status atualizado e profile ativado só após confirmação correta.

### Detalhes técnicos

- Alterar principalmente:
  - `supabase/functions/criar-pix-recorrente-asaas/index.ts`
  - `supabase/functions/webhook-asaas/index.ts`
  - `supabase/functions/change-asaas-plan/index.ts`
  - `src/pages/CheckoutV2.tsx`
  - possivelmente `src/components/portal/ChangePlanDialog.tsx`
- Criar migration para tabela/colunas de autorizações PIX Automático.
- Manter compatibilidade com o modelo antigo por enquanto.
- Não mexer em Stripe/cartão.
- Não mexer em PIX one-time clássico, exceto se a UI estiver chamando a função recorrente onde deveria chamar o fluxo automático.

### Resultado esperado

Novos pagamentos PIX deixam de ser “recorrência manual com QR novo” e passam a ser PIX Automático Bacen real; o legado continua funcionando até uma migração separada dos clientes já ativos.