

# Monitoramento de Instâncias WhatsApp com Alerta por Email

## O que será feito

1. **Nova tabela `instance_health_logs`** para registrar o histórico de verificações de cada instância
2. **Colunas extras em `whatsapp_instances`**: `last_health_check`, `last_disconnected_at`
3. **Edge Function `check-instance-health`** que verifica o status de cada instância ativa via Z-API (`GET /status`) e envia email de alerta quando detecta queda
4. **Cron job a cada 5 minutos** chamando a function
5. **Painel de status na página Admin** mostrando cada instância com indicador verde/vermelho, último check e histórico recente

## Detalhes técnicos

### Migração SQL
- Criar `instance_health_logs` (id, instance_id FK, checked_at, is_connected, smartphone_connected, error_message, response_raw jsonb, alert_sent boolean)
- RLS: apenas service_role
- Adicionar `last_health_check timestamptz` e `last_disconnected_at timestamptz` em `whatsapp_instances`

### Edge Function `check-instance-health`
- Para cada instância ativa, chama `GET https://api.z-api.io/instances/{id}/token/{token}/status`
- Se `connected: false` ou erro:
  - Atualiza `whatsapp_instances.status = 'disconnected'` e `last_disconnected_at = now()`
  - Verifica se já enviou alerta recente (últimos 30 min) para evitar spam
  - Envia email de alerta usando Lovable AI (ou edge function interna com Resend se disponível) para o admin
- Se conectado: atualiza `last_health_check = now()` e garante `status = 'active'`
- Registra tudo em `instance_health_logs`

### Alerta por email
- Usará um email simples enviado via edge function (precisa verificar se há integração de email disponível, senão usar um serviço como Resend com API key)

### Cron job
- `pg_cron` + `pg_net` a cada 5 minutos chamando `check-instance-health`

### Painel Admin (nova página ou seção em AdminTests)
- Nova rota `/admin/instancias` ou seção no topo de AdminTests
- Lista cada instância com: nome, telefone, status (badge verde/vermelho), último check, usuários atuais/max
- Histórico das últimas 24h de checks por instância
- Botão "Verificar Agora" que chama a function manualmente

## Arquivos a criar/modificar

| Arquivo | Ação |
|---|---|
| Migração SQL | Criar tabela + colunas |
| `supabase/functions/check-instance-health/index.ts` | Criar |
| `supabase/config.toml` | Adicionar function |
| `src/pages/AdminInstances.tsx` | Criar painel de monitoramento |
| `src/App.tsx` | Adicionar rota `/admin/instancias` |
| SQL (insert, não migração) | Cron job |

## Pré-requisito
- Será necessária uma API key de serviço de email (ex: Resend) para enviar os alertas, a menos que já exista uma configurada. Verificarei as opções disponíveis na implementação.

