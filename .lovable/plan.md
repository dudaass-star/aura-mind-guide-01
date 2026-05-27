# Recovery Agent — Resposta automática a leads de checkout abandonado

Agente dedicado que responde no WhatsApp (subaccount Twilio de recovery) os leads que reagiram ao template de carrinho abandonado. Objetivo: **converter lead frio**, não conversar e não atender cliente ativo.

## Decisões aprovadas

- Escopo: responde tudo, exceto saudações/agradecimentos curtos.
- Limite: 3 respostas automáticas por conversa, depois encerra.
- Reenvio de link: decisão do LLM via tag `[ENVIAR_LINK]`.
- Modo: produção direto, com toggle global de kill switch.
- **Público-alvo: apenas leads que nunca foram usuários ativos.** Assinantes ativos, em trial, past_due ou cancelados (que ainda têm acesso) NUNCA são respondidos pelo bot de recovery.
- **Base de conhecimento estruturada** alimenta o prompt (não tudo no system prompt).

## Arquitetura

```text
Lead responde template recovery
        │
        ▼
webhook-twilio-recovery (já existe, ganha gatilho)
  • grava recovery_messages (in)
  • upsert recovery_conversations
  • NOVO: dispara recovery-agent (fire-and-forget)
        │
        ▼
recovery-agent (NOVA edge function)
  1. Carrega config + checa kill switch (enabled?)
  2. GUARD: telefone pertence a profile com subscription ativa/trial/past_due?
        → SIM: marca conversa needs_human=true, motivo='active_user',
                NÃO responde, retorna. Admin assume manualmente.
  3. Horário silencioso 22h-08h BRT → skip
  4. Filtro saudação curta (regex) → skip
  5. auto_reply_count >= 3 ou needs_human=true → skip
  6. Stop words ("atendente","humano") → marca needs_human, skip
  7. Carrega: histórico recovery_messages + checkout_sessions linkada
              + knowledge base (recovery_kb ativos)
  8. Monta prompt: system_prompt + KB injetada + contexto checkout + histórico
  9. Chama Lovable AI (gemini-2.5-flash)
  10. Parse tags: [ENVIAR_LINK] [ESCALAR_HUMANO] [STOP]
  11. Envia via subaccount Twilio (TWILIO_RECOVERY_*)
  12. Grava recovery_messages (out, metadata.bot=true, metadata.kb_used=[ids])
  13. Incrementa auto_reply_count, atualiza last_bot_reply_at
```

## Base de conhecimento (KB) — peça central

Nova tabela `recovery_knowledge_base` (estrutura inspirada em `support_knowledge_base` que já existe no projeto):

- `id`, `created_at`, `updated_at`
- `category` text — ex: `preco`, `garantia`, `como_funciona`, `seguranca`, `objecao_tempo`, `objecao_valor`, `comparacao`, `tecnico`, `pagamento`
- `question` text — pergunta/objeção típica em PT-BR ("É muito caro", "Como cancelo?", "Preciso de cartão?")
- `answer` text — resposta canônica curta, tom Aura, que o agente DEVE usar como verdade factual
- `keywords` text[] — termos para matching simples
- `priority` int — ordem de injeção quando passa do limite
- `is_active` boolean default true
- `usage_count` / `approved_count` / `rejected_count` int (telemetria igual KB de suporte)

### Estratégia de injeção (sem embeddings na v1)

1. **Sempre injeta** os ~8 itens de `category IN ('preco','garantia','como_funciona','pagamento','seguranca')` com `is_active=true` — é a base mínima de verdade que o bot precisa pra qualquer conversa.
2. **Match por keyword**: extrai palavras da última mensagem do lead, busca KBs onde `keywords && palavras` ou `question ILIKE '%...%'`, injeta top 5 por `priority` desc + `usage_count` desc.
3. **Limite total**: até 12 itens, ~2k tokens.

Embeddings ficam de fora da v1 (KB pequena, ~30-50 entradas; keyword match basta). Plano de evolução: migrar pra `match_recovery_kb()` com pgvector quando passar de 100 entradas.

### Seed inicial

Migration popula ~25 entradas cobrindo: preço dos 3 planos, garantia/cancelamento, como funciona (WhatsApp + sessões + portal), formas de pagamento (cartão only, sem PIX), segurança/privacidade, "preciso baixar app?", "funciona offline?", "quem é a Aura?", "é terapia?", "atendimento humano?", objeções clássicas ("não tenho tempo", "muito caro", "vou pensar", "já uso outro app").

Conteúdo das respostas vem das memórias `mem://business/subscription-usage-limits`, `mem://features/checkout/social-proof-and-guarantee`, `mem://business/payment-methods-current-state` e do código da landing `/v2`.

### Painel admin de KB

Nova tela `/admin/recovery-knowledge` (segue padrão `support_knowledge_base`):
- Lista, filtro por categoria, busca textual.
- CRUD inline (question, answer, keywords, is_active, priority).
- Coluna de telemetria (usage_count, taxa de aprovação).
- Botão "Testar pergunta" — envia uma query, mostra quais KBs casaram e qual resposta o agente geraria (sem enviar Twilio).

## Guard contra usuário ativo (passo 2 do fluxo)

Query no início do agent:

```sql
select id, subscription_status
from profiles
where phone in (variações do telefone)
  and subscription_status in ('active','trialing','past_due','canceling')
limit 1;
```

Se retornar linha → marca `recovery_conversations.needs_human=true`, `auto_paused_reason='active_user'`, loga e sai. Admin recebe no inbox de recovery com badge vermelho "⚠️ Usuário ativo — não responda como lead" e responde manualmente (ou redireciona pro inbox oficial da Aura).

Isso protege contra: cliente que respondeu sem querer ao template antigo, cliente que mudou de número, cliente que tá com pagamento atrasado e veio reclamar.

## Mudanças no banco

**Tabela nova `recovery_agent_config`** (1 linha singleton):
- `enabled` boolean default true
- `max_auto_replies` int default 3
- `silent_hours_start` / `silent_hours_end` int default 22/8
- `model` text default `google/gemini-2.5-flash`
- `system_prompt` text (editável)

**Tabela nova `recovery_knowledge_base`** (descrita acima).

**Colunas novas em `recovery_conversations`**:
- `auto_reply_count` int default 0
- `needs_human` boolean default false
- `last_bot_reply_at` timestamptz
- `auto_paused_reason` text — valores: `limit_reached`, `user_requested_human`, `stop_word`, `lead_declined`, `active_user`

RLS: tudo admin-only via `has_role(auth.uid(),'admin')`. GRANTs pra `authenticated` e `service_role`. Inclui GRANTs explícitos (não esquecer — regra do projeto).

## Edge function `recovery-agent`

`supabase/functions/recovery-agent/index.ts`. `verify_jwt = false`. Chamada via `supabase.functions.invoke()` em fire-and-forget (`EdgeRuntime.waitUntil`) do webhook.

Reusa helper Twilio de envio extraído pra `_shared/twilio-recovery.ts` (refatora `whatsapp-recovery-admin-reply` pra usar o mesmo helper).

### Prompt skeleton

```
Você é uma consultora breve da Aura falando com {{name|alguém}} que iniciou
o checkout do plano {{plano}} (R$ {{preço}}) e não finalizou.

REGRAS DE VERDADE:
- Use APENAS as informações da BASE DE CONHECIMENTO abaixo como fatos.
- Se a pergunta não está coberta, oriente o lead a entrar em contato com
  nosso time pelo email suporte@olaaura.com.br e emita [ESCALAR_HUMANO].
  NUNCA diga "vou pedir pra alguém te responder" — não há atendimento
  humano garantido no WhatsApp de recovery.
- Nunca invente preço, prazo, feature, integração.

BASE DE CONHECIMENTO:
{{kb_items_injetados}}

CONTEXTO DO CHECKOUT:
- Plano: {{plano}} — R$ {{preço}}/mês
- Link para retomar: {{checkout_url}}
- Iniciado em: {{data}}

HISTÓRICO DA CONVERSA:
{{recovery_messages_recentes}}

DIRETIVAS:
- PT-BR informal, 1-3 frases, sem emoji decorativo.
- Responda a objeção/dúvida real do lead.
- NÃO faça terapia, NÃO prometa o que não está na KB.
- Tags no final (uma só):
  [ENVIAR_LINK] — bot anexa o link do checkout.
  [ESCALAR_HUMANO] — encerra automação e instrui lead a email de suporte.
  [STOP] — lead recusou, encerra automação.
```

## Painel admin (mensagens)

Aba "Recuperação" em `/admin/mensagens`:
- Badge "🤖 auto" nas mensagens do bot.
- Header da conversa: badge "Auto pausado: {motivo}" quando `needs_human=true`.
- Badge especial vermelho "⚠️ Usuário ativo" quando `auto_paused_reason='active_user'`, com link direto pro perfil do user no admin.
- Botão "Reativar bot" (zera contador, limpa needs_human) — desabilitado se `auto_paused_reason='active_user'`.

Nova tela `/admin/recovery-agent`:
- Toggle global enabled.
- Edição do system_prompt, max_auto_replies, modelo.
- Link pra `/admin/recovery-knowledge`.

## Telemetria

- Logs estruturados no `recovery-agent`: skip_reason, kb_ids usados, tokens, latência.
- Cada resposta gravada com `metadata.kb_used=[ids]` permite calcular taxa de uso de cada KB.
- Botão na tela de KB pra "marcar útil" / "marcar errada" baseado nas conversas (estilo `record_kb_feedback` que já existe no projeto).

## Não-objetivos

- Não muda template de saída inicial do recovery.
- Não muda webhook da Aura oficial.
- Não envia áudio.
- Não atende usuários ativos (filtrado por guard).
- Não responde dúvidas técnicas de cliente existente (cliente ativo cai no guard e vira admin manual).
- Sem embeddings na v1 (keyword match basta pra ~30-50 entradas).
