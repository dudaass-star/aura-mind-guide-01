

# Seletor de Modelo AI no Admin + Suporte a Claude Sonnet 4.6

## Nomenclatura confirmada
- `claude-sonnet-4-6` (confirmado pelo usuario)
- `google/gemini-2.5-pro` (atual, default)
- `google/gemini-2.5-flash`
- `openai/gpt-5`

## Etapas

### 1. Configurar ANTHROPIC_API_KEY
Solicitar via `add_secret`.

### 2. Criar tabela `system_config`
```sql
CREATE TABLE public.system_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access" ON public.system_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role full access" ON public.system_config
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

INSERT INTO public.system_config (key, value)
VALUES ('ai_model', '"google/gemini-2.5-pro"');
```

### 3. Nova pagina `AdminSettings.tsx`
- Rota `/admin/configuracoes`
- Card com Select dos 4 modelos, botao Salvar → upsert em `system_config`
- Usa `useAdminAuth` para protecao
- Adicionar rota no `App.tsx`

### 4. Alterar `aura-agent/index.ts`

**Funcao `callAI()`** no topo do arquivo que:
- Recebe `model, messages, maxTokens, temperature`
- Se modelo comeca com `google/` ou `openai/` → Lovable AI Gateway (como hoje)
- Se modelo comeca com `claude-` → API Anthropic direta

**Adaptador Anthropic** dentro de `callAI()`:
- Extrai mensagens com `role: 'system'` → parametro raiz `system`
- Merge mensagens consecutivas do mesmo role (exigencia Anthropic)
- Envia `max_tokens` obrigatoriamente
- POST para `https://api.anthropic.com/v1/messages`
- Headers: `x-api-key`, `anthropic-version: 2023-06-01`, `content-type`
- Converte resposta Anthropic para formato compativel (`choices[0].message.content`)

**Leitura do modelo ativo**: query `system_config` onde `key = 'ai_model'` no inicio do handler. Chamada principal (linha ~3593) usa modelo configurado. Chamadas auxiliares (summary, onboarding, topic) continuam com `google/gemini-2.5-flash` para economia.

### Arquivos
- **Novo**: `src/pages/AdminSettings.tsx`
- **Editado**: `src/App.tsx` (rota)
- **Editado**: `supabase/functions/aura-agent/index.ts` (callAI + adaptador + leitura config)
- **Migration**: tabela `system_config`

