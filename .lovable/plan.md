

## Base de Conhecimento Vetorizada (RAG) + Políticas Oficiais

Vamos entregar **dois pacotes em paralelo**: a infraestrutura RAG e o conteúdo das políticas oficiais (escritos por mim seguindo melhores práticas SaaS BR + LGPD + CDC).

---

### Parte 1 — Infraestrutura técnica (RAG)

**Banco:**
- Habilita extensão `pgvector`
- Tabela `support_knowledge_base`: `id`, `title`, `category`, `question`, `answer`, `keywords[]`, `embedding vector(768)`, `is_active`, `usage_count`, `created_at`, `updated_at`, `created_by`
- Função SQL `match_support_kb(query_embedding, threshold, count)` — busca por similaridade cosseno
- RLS admin-only (igual aos outros support_*)

**Edge functions novas:**
1. `support-kb-embed` — gera embedding via Gemini `text-embedding-004` (768 dim) ao salvar/editar artigo
2. `support-kb-search` — busca debug pelo painel (input texto → top 5 com scores)

**Mudança em `support-agent`:**
- Antes de chamar Gemini Pro, gera embedding da pergunta do cliente (assunto + último email)
- Busca top 5 artigos com threshold 0.7
- Injeta no prompt como bloco `BASE DE CONHECIMENTO OFICIAL` com instrução: *"Use APENAS estes artigos como fonte de verdade. Se a pergunta não for coberta, diga que vai verificar com a equipe."*
- Salva IDs usados em `context_snapshot.kb_used` e incrementa `usage_count`

**Frontend `/admin/suporte/conhecimento`:**
- Lista por categoria com badge de `usage_count` e busca textual
- Editor: title, category (select), question, answer (textarea grande markdown), keywords (chips), toggle is_active
- Botão "Testar busca" — modal pra você validar cobertura antes de publicar
- Auto-embed ao salvar

---

### Parte 2 — Conteúdo das políticas (eu escrevo, você revisa)

Vou criar **15 artigos seed** seguindo melhores práticas:

**Cobrança e pagamento (4):**
1. Política de reembolso (7 dias CDC + critérios pós-prazo)
2. Falha no cartão / cobrança recusada (Smart Retries Stripe, dunning, prazo)
3. Atualizar método de pagamento (link billing portal)
4. Diferença mensal vs anual / como mudar ciclo

**Assinatura (4):**
5. Como cancelar (impacto: acesso até fim do ciclo, sem reembolso parcial)
6. Como pausar (até 30 dias, preserva histórico)
7. Trocar de plano: upgrade (proration imediata) vs downgrade (no próximo ciclo)
8. Reativar conta cancelada (mesma conta, sem perder histórico)

**Produto e técnico (4):**
9. Não estou recebendo mensagem da Aura (debug: número correto, bloqueio WhatsApp, instância)
10. Como acessar o portal /meu-espaco (link via WhatsApp, validade do token)
11. Diferença entre planos Essencial / Direção / Transformação (limites de mensagens, sessões, áudio)
12. Trial pago de 7 dias (R$ 6,90 / 11,90 / 24,90 — conversão automática, como cancelar antes)

**Privacidade e legal (3):**
13. Privacidade e LGPD (dados coletados, finalidade, retenção, direitos do titular)
14. Aura não substitui terapia (disclaimer obrigatório + CVV 188 em emergência)
15. Solicitar exclusão de conta e dados (prazo 30 dias, exceções legais)

**Padrão de cada artigo:**
- Tom: PT-BR direto, sem juridiquês desnecessário
- Estrutura: pergunta canônica → resposta curta (1-2 frases) → detalhes → quando escalar pra humano
- Sempre cita a base legal quando aplicável (CDC art. 49 pra reembolso, LGPD art. 18 pra direitos do titular)
- Inclui `keywords` com sinônimos comuns ("estornar", "devolver dinheiro", "cancelar cobrança" → todos apontam pro artigo de reembolso)

---

### Melhores práticas aplicadas

- **Versionamento implícito** via `updated_at` (fase 2 traz histórico completo)
- **Threshold 0.7** evita falsos positivos (testado como sweet spot pra PT-BR com Gemini embeddings)
- **Máximo 5 artigos no contexto** evita poluir o prompt e diluir foco
- **`usage_count`** vira métrica de qualidade da KB (artigo nunca usado = pergunta errada ou keywords ruins)
- **Auditoria completa**: `kb_used` no draft mostra exatamente quais artigos a IA consultou
- **Fallback explícito**: se score < 0.7 em todos, IA é instruída a NÃO inventar e escalar
- **Segregação clara** entre "política oficial" (KB) e "contexto do cliente" (Stripe/profile) no prompt

---

### Entregáveis

1. Migration: `pgvector` + tabela `support_knowledge_base` + função `match_support_kb` + RLS
2. 2 edge functions novas (`support-kb-embed`, `support-kb-search`)
3. `support-agent` atualizado com fluxo RAG completo
4. Sub-rota `/admin/suporte/conhecimento` (lista + editor + teste de busca)
5. **15 artigos seed inseridos no banco** (você edita depois pelo painel)

### Fora de escopo (fase 2)
- Histórico de versões de artigos
- Import/export CSV
- Re-embedding em massa (script manual quando necessário)
- A/B testing de respostas

