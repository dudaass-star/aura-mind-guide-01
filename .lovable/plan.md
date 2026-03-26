

## Visibilidade das Mensagens de Recuperação

### Problema
As mensagens de recuperação são enviadas via WhatsApp para telefones de pessoas sem perfil no sistema. A tela AdminMessages só exibe conversas de usuários cadastrados (tabela `messages` + `profiles`). Por isso, as recuperações são invisíveis no painel.

### Solução
Adicionar uma aba ou seção na tela de Engajamento (ou Mensagens) mostrando o histórico de tentativas de recuperação de checkout abandonado, puxando dados diretamente da tabela `checkout_sessions`.

### Implementação

**1. Adicionar seção no AdminEngagement (já tem o funil de checkout)**

Criar um card "Recuperação de Checkout" abaixo do funil existente, listando:
- Nome, telefone (parcial), plano
- Data do abandono
- Se a mensagem de recuperação foi enviada (`recovery_sent`)
- Se a pessoa voltou depois (verificar se existe novo `checkout_sessions` com mesmo telefone e `status = 'completed'`)

**2. Dados vêm da tabela `checkout_sessions`**
- Filtrar: `recovery_sent = true`
- Mostrar status atual (ainda abandonado vs. converteu depois)
- Nenhuma migração necessária -- os dados já existem

**3. Arquivo alterado**
- `src/pages/AdminEngagement.tsx` -- adicionar card/tabela de recuperações

