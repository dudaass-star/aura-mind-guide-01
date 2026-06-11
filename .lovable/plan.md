## Confirmação dos IDs

- WABA: `4389879528007597` ✅ (bate com `META_WHATSAPP_BUSINESS_ACCOUNT_ID`)
- Phone Number ID: `1102172772986795` ✅ (bate com `META_WHATSAPP_PHONE_NUMBER_ID` e com a constante no `test-meta-new-number`)
- Número: `+1 555-958-6099` ✅

Tudo certo — o sender Meta já aponta pro número novo via secret.

## Diagnóstico do erro de variável

Os templates novos foram criados no Meta como **named parameters** (tipo "Customer Name"), não posicional. Por isso o corpo aparece com `{{}}` sem número no Composer — o Meta só usa nome de variável, não índice.

A Cloud API rejeita esse template quando recebe parâmetro **posicional**:

```json
// o que o sender manda hoje (errado pra named params)
{ "type": "body", "parameters": [{ "type": "text", "text": "Eduardo" }] }
```

```json
// o que o Meta espera pra named params
{ "type": "body", "parameters": [{ "type": "text", "parameter_name": "name", "text": "Eduardo" }] }
```

Sem o `parameter_name`, o Meta devolve 132000 ("number of parameters does not match"). É exatamente o erro que vimos nos testes.

## Mudanças

### 1. Schema — adicionar nome da variável por template

Migration adicionando coluna `meta_variable_names text[]` em `whatsapp_templates` (array ordenado de nomes, ex.: `{"name"}`).

```sql
alter table public.whatsapp_templates
  add column if not exists meta_variable_names text[];
```

Depois, popular os 5 templates novos com `{"name"}` (todos têm 1 variável de nome) e reativar `cheking_7dias` (você confirmou que submeteu pra aprovação — fica `is_active = false` até aprovar; quando aprovar a gente liga).

### 2. Sender Meta — suportar named parameters

`supabase/functions/_shared/meta-whatsapp-client.ts`:

- `sendTemplateMessage` ganha parâmetro opcional `variableNames?: string[]`. Se presente e mesmo length que `variables`, monta cada `parameter` com `parameter_name` + `text`. Senão, mantém formato posicional atual (compat com templates antigos).
- `sendProactiveMessage` e `sendTemplateOnly` lêem `meta_variable_names` do banco e repassam pro `sendTemplateMessage`.

Nenhum outro caller precisa mudar — o array é opcional e o default segue posicional.

### 3. Mapeamento revisado da tabela

```sql
-- volta pros nomes reais aprovados no número novo (sem o "2" exceto quando o Meta exige)
update public.whatsapp_templates
   set meta_template_name = 'relatorio_semanal',
       meta_language_code = 'pt_BR',
       meta_variable_count = 1,
       meta_variable_names = array['name']
 where category = 'weekly_report';

update public.whatsapp_templates
   set meta_template_name = 'jornada_semanal',
       meta_language_code = 'pt_BR',
       meta_variable_count = 1,
       meta_variable_names = array['name']
 where category = 'content';

update public.whatsapp_templates
   set meta_template_name = 'sessao_inicio2',
       meta_language_code = 'pt_BR',
       meta_variable_count = 1,
       meta_variable_names = array['name']
 where category = 'session_reminder';

update public.whatsapp_templates
   set meta_template_name = 'welcome2',
       meta_language_code = 'pt_BR',
       meta_variable_count = 1,
       meta_variable_names = array['name']
 where category = 'welcome';

update public.whatsapp_templates
   set meta_template_name = 'carta_mensal',
       meta_language_code = 'en',
       meta_variable_count = 1,
       meta_variable_names = array['name']
 where category = 'monthly_letter';
```

`checkin` segue `is_active = false` até `cheking_7dias` ser aprovado no número novo.

### 4. Validação

Atualizar `test-meta-new-number/index.ts` pra aceitar `parameter_name` no payload de teste e rodar 1 envio pra cada template confirmando `wamid` no retorno. Se algum cair 132000 de novo, é sinal que o Meta criou aquele template específico como posicional — aí basta limpar `meta_variable_names` daquela linha.

## Pergunta antes de eu confirmar

Vou assumir que o nome da variável que o Meta atribuiu nos 5 templates é literalmente `name` (é o default quando você marca "Customer Name" no Composer). **Confirma que aparece `{{name}}` no preview do template no painel Meta?** Se em algum aparecer outro nome (ex.: `first_name`, `customer_name`), me passa quais — ajusto o array antes da migration rodar.

## Fora de escopo

- Não desativar Twilio (segue fallback).
- Não trocar `whatsapp_provider`.
- Submissão do `cheking_7dias` (você faz no painel; depois eu reativo).
