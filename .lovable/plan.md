

## Correções Pendentes

### 1. Deletar perfil duplicado da Nilda Rita
O perfil com telefone `555181519712` (sem o 9) ainda existe no banco. Precisa ser deletado junto com suas mensagens.

### 2. Verificar cron do periodic-content
A função `periodic-content` deveria ter rodado hoje (sexta, 9h BR) mas não há logs. Verificar se o cron job está ativo e funcionando.

### Ações
1. Executar DELETE nas mensagens e no perfil duplicado da Nilda Rita (phone `555181519712`)
2. Verificar/recriar o cron job do `periodic-content` se necessário
3. Opcionalmente, disparar manualmente o `periodic-content` para enviar o EP1 da Nilda agora

