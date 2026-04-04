

## Plano: Portal do Usuário + Ajustes nas Funções Proativas

### Escopo (sem SMS por enquanto)

Foco em 3 frentes: **Portal do Usuário**, **Resumo Mensal e Cápsula como link**, **Ajustes nos lembretes e follow-up**.

Insights (pattern-analysis) ficam como estão por enquanto — sem SMS fallback nesta fase.

---

### Fase 1: Database — Novas tabelas

**Migração SQL:**

1. `user_portal_tokens` — token único por usuário para acesso ao portal sem login
   - `id uuid PK`, `user_id uuid NOT NULL`, `token uuid DEFAULT gen_random_uuid()`, `created_at timestamptz`
   - RLS: service_role full access + SELECT público (para validar token na URL)

2. `monthly_reports` — relatórios salvos para renderização no portal
   - `id uuid PK`, `user_id uuid NOT NULL`, `report_month date`, `metrics_json jsonb`, `analysis_text text`, `report_html text`, `created_at timestamptz`
   - RLS: service_role full access + SELECT para owner (`auth.uid() = user_id`)

---

### Fase 2: Portal do Usuário (`/meu-espaco`)

**Novo arquivo:** `src/pages/UserPortal.tsx`

Acesso via `olaaura.com.br/meu-espaco?t=TOKEN_UUID`

O token na URL é validado contra `user_portal_tokens` para identificar o usuário. Sem login/senha.

**Abas do portal:**
- **Jornadas** — Lista episódios já enviados (query `journey_episodes` + progresso do perfil)
- **Resumos Mensais** — Cards com métricas e análise AI (query `monthly_reports`)
- **Meditações** — Catálogo de meditações do plano com player de áudio inline (query `meditations` + `meditation_audios` + `user_meditation_history`)
- **Cápsulas do Tempo** — Histórico de cápsulas entregues com player de áudio + transcrição (query `time_capsules`)

**Design:** Mesmo branding da página Episode (logo, cores, tipografia). Mobile-first.

**Rota:** Adicionar em `src/App.tsx`: `/meu-espaco`

---

### Fase 3: Geração de tokens

Gerar token automaticamente no `start-trial` e `stripe-webhook` (quando perfil é criado/ativado). Inserir em `user_portal_tokens` se não existir.

---

### Fase 4: Resumo Mensal como link

**Alterar:** `supabase/functions/weekly-report/index.ts`

Mudanças:
1. Após gerar o relatório (métricas + análise AI), **salvar em `monthly_reports`**
2. Buscar/criar o token do portal do usuário
3. Gerar short link para `olaaura.com.br/meu-espaco?t=TOKEN&tab=resumos`
4. Enviar **teaser curto** via WhatsApp (sendProactive):
   ```
   Oi, [Nome]! Seu resumo de [mês] está pronto 📊✨
   
   Veja aqui: [link]
   
   — Aura 💜
   ```
5. Salvar mensagem no histórico normalmente

---

### Fase 5: Cápsula do Tempo como link

**Alterar:** `supabase/functions/deliver-time-capsule/index.ts`

Mudanças:
1. Em vez de enviar áudio diretamente no WhatsApp, enviar **teaser + link** do portal:
   ```
   [Nome], lembra daquela cápsula do tempo que você gravou? 💜✨
   
   Chegou a hora de ouvir! Escuta com carinho 🫶
   [link para /meu-espaco?t=TOKEN&tab=capsulas]
   
   — Aura
   ```
2. Marcar como entregue normalmente
3. Remover o envio de áudio direto e mensagens de closing

---

### Fase 6: Session Reminder — Simplificar para 24h + 5min

**Alterar:** `supabase/functions/session-reminder/index.ts`

- **Remover** o bloco de lembrete de 1h (`reminder_1h_sent`)
- **Remover** o bloco de lembrete de 15min (`reminder_15m_sent`)
- **Remover** o bloco de lembrete de 10min
- **Adicionar** lembrete de 5min antes (novo campo `reminder_5m_sent` na tabela `sessions`, ou reutilizar `reminder_15m_sent` como flag de "5min")
- Resultado: apenas **24h antes** e **5min antes**

**Migração:** Adicionar coluna `reminder_5m_sent boolean DEFAULT false` na tabela `sessions`

---

### Fase 7: Conversation Follow-up — Guard de janela 24h

**Alterar:** `supabase/functions/conversation-followup/index.ts`

Adicionar verificação antes de enviar: se a janela de 24h do WhatsApp estiver **fechada** (último `last_user_message_at` > 24h), **não enviar** o follow-up. Apenas logar e pular.

Isso já é parcialmente tratado pelo `sendProactiveMessage` que tenta template → falha, mas agora vamos abortar **antes** para evitar tentativas desnecessárias.

---

### Arquivos criados/alterados

| Arquivo | Ação |
|---------|------|
| Migração SQL | `user_portal_tokens`, `monthly_reports`, `reminder_5m_sent` |
| `src/pages/UserPortal.tsx` | Criar |
| `src/App.tsx` | Adicionar rota `/meu-espaco` |
| `supabase/functions/weekly-report/index.ts` | Salvar relatório + enviar teaser+link |
| `supabase/functions/deliver-time-capsule/index.ts` | Teaser+link em vez de áudio direto |
| `supabase/functions/session-reminder/index.ts` | Remover 1h/15min/10min, adicionar 5min |
| `supabase/functions/conversation-followup/index.ts` | Guard de janela 24h |
| `supabase/functions/start-trial/index.ts` | Gerar token do portal |
| `supabase/functions/stripe-webhook/index.ts` | Gerar token do portal |

### Sequência de implementação

1. Migração (tabelas + coluna)
2. Portal do Usuário (página + rota)
3. Geração de tokens (start-trial + stripe-webhook)
4. Resumo mensal como link
5. Cápsula do tempo como link
6. Session reminder (24h + 5min)
7. Conversation followup (guard 24h)

