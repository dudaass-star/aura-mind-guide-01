
Objetivo: corrigir o fluxo de recuperação de checkout para garantir envio real (e rastreável), porque hoje o sistema marca como enviado sem prova de entrega no WhatsApp.

1) Diagnóstico consolidado (já confirmado)
- O job automático está ativo e rodando a cada 10 min (`cron.job` id 21, status succeeded).
- Seus 2 checkouts aparecem como `recovery_sent = true`.
- A função atual (`recover-abandoned-checkout`) marca `recovery_sent = true` logo após `sendTextMessage` retornar sucesso HTTP.
- Não existe trilha de auditoria de entrega (só flag booleana).
- Forte indício técnico: a maioria dos telefones em `checkout_sessions` está sem DDI 55, o que pode causar “aceito pela API” mas não entregue.

2) Implementação proposta
- Endurecer normalização de telefone no módulo compartilhado:
  - Garantir padrão WhatsApp Brasil (`55 + DDD + número`) antes de qualquer envio.
  - Usar essa normalização dentro de `sendTextMessage` (e áudio também, para consistência).
- Melhorar `recover-abandoned-checkout`:
  - Não tratar apenas `response.ok` como “entregue”.
  - Registrar tentativa com status detalhado (`api_accepted`, `failed`, erro retornado).
  - Atualizar `checkout_sessions.recovery_sent = true` somente quando houver confirmação mínima válida do provider (ack de envio, não só ausência de erro).
  - Salvar `recovery_sent_at` e último erro para diagnóstico.
- Adicionar observabilidade:
  - Nova tabela de tentativas de recuperação por sessão (histórico completo de cada tentativa, payload de resposta, erro).
  - Sem isso, hoje não dá para provar “foi enviado de fato” vs “requisição apenas aceita”.
- Ajustar dashboard admin:
  - Separar “Tentou enviar”, “Aceito pela API”, “Falhou”.
  - Exibir motivo de falha por linha (telefone inválido, erro provider, etc).
- Proteção opcional recomendada:
  - Bloquear recuperação para quem já está `active/trial` (via match de telefone por variações), para evitar disparo indevido em cliente já ativo.

3) Banco de dados (migração)
- Alterar `checkout_sessions`:
  - `recovery_sent_at timestamptz null`
  - `recovery_last_error text null`
  - `recovery_attempts_count int default 0`
- Criar `checkout_recovery_attempts` com:
  - `id`, `checkout_session_id`, `phone_raw`, `phone_normalized`, `status`, `provider_response`, `error_message`, `created_at`
- RLS:
  - Service role full access
  - Admin leitura (como já é feito em outras tabelas de monitoramento)

4) Arquivos que serão alterados
- `supabase/functions/_shared/zapi-client.ts`
- `supabase/functions/recover-abandoned-checkout/index.ts`
- `src/pages/AdminEngagement.tsx`
- `supabase/migrations/*` (nova migração para tabela/colunas/RLS)

5) Validação (fim-a-fim)
- Criar 2 checkouts de teste:
  - Um com telefone sem 55 e outro com 55.
- Aguardar janela de abandono e execução do job.
- Confirmar no admin:
  - tentativa registrada,
  - status correto por tentativa,
  - `recovery_sent_at` preenchido quando aplicável.
- Validar especificamente seu número de teste com evidência de tentativa + resposta do provider.

6) Resultado esperado
- Se a mensagem não chegar, passaremos a saber exatamente “onde” falhou.
- Se o problema for formato de telefone, ele será corrigido na origem.
- O painel deixa de dar falso positivo de “mensagem enviada” sem rastreabilidade real.
