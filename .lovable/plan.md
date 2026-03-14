

## Diagnóstico Atual

**Usuários trial NÃO aparecem nas métricas atuais.** O painel de engajamento filtra apenas `status = 'active'`, então trial users são invisíveis.

Os dados para construir um painel de funil de trial já existem na tabela `profiles`:
- `status = 'trial'` identifica usuários em trial
- `trial_started_at` marca quando começaram
- `trial_conversations_count` conta interações durante o trial
- Quando convertem, o `stripe-webhook` atualiza status para `active`

## Proposta: Adicionar aba "Trial & Conversão" ao painel de engajamento

### Métricas a implementar

| Metrica | Cálculo |
|---------|---------|
| Trials ativos | profiles com status = 'trial' |
| Trials nos últimos 7/30 dias | profiles com trial_started_at nos últimos 7/30 dias |
| Convertidos (assinaram) | profiles com status = 'active' e trial_started_at preenchido |
| Taxa de conversão | convertidos / total trials iniciados |
| Trials expirados/abandonados | profiles com status = 'trial' e trial_started_at > 7 dias |
| Tempo médio até conversão | média de (created_at com status active - trial_started_at) |
| Msgs médias no trial | média de trial_conversations_count dos convertidos vs não-convertidos |

### Alterações

1. **Edge Function `admin-engagement-metrics`**: Adicionar cálculo das métricas de trial/conversão no mesmo endpoint, retornando dados adicionais.

2. **Página `AdminEngagement.tsx`**: Adicionar uma segunda seção (ou abas) com os cards de trial/conversão abaixo dos cards existentes.

Nenhuma alteração no banco de dados é necessária -- todos os dados já estão disponíveis.

