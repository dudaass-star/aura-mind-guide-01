

## Plano: Finalizar Templates WhatsApp da Aura + Ajustar Lógica de Envio

### Contexto
Você está criando os templates na Meta com apenas **1 variável (nome)** e categoria **Utilidade**. Precisamos ajustar o sistema para:
1. Mapear os templates corretos na tabela `whatsapp_templates`
2. Ajustar a lógica do Insight para funcionar com botão (template abre janela → Aura manda o insight como texto livre)
3. Garantir que Resumo e Jornada **sempre usem link** (mesmo dentro da janela de 24h)

### Templates a manter/ajustar na tabela `whatsapp_templates`

| Categoria | Template Name | Texto fixo (aprovado na Meta) | Variável {{1}} | Categoria Meta |
|-----------|--------------|-------------------------------|----------------|----------------|
| `checkin` | `aura_checkin_v2` | Check-in padrão | Nome | Utilidade |
| `welcome` | `aura_welcome_v2` | Boas-vindas pago | Nome | Utilidade |
| `welcome_trial` | `aura_welcome_trial_v2` | Boas-vindas trial | Nome | Utilidade |
| `reconnect` | `aura_reconnect_v2` | Reconexão | Nome | Utilidade |
| `reactivation` | `aura_reactivation_v2` | Reativação | Nome | Utilidade |
| `access_blocked` | `aura_access_blocked_v2` | Acesso bloqueado | Nome | Utilidade |
| `weekly_report` | `aura_weekly_report_v2` | **NOVO** — "{{1}}, seu resumo está pronto! Veja aqui:" + botão/link | Nome | Utilidade |
| `content` | `aura_content_v2` | **NOVO** — "{{1}}, seu próximo episódio está disponível!" + botão/link | Nome | Utilidade |
| `insight` | `aura_insight_v2` | **NOVO** — "{{1}}, tenho um insight especial para você!" + botão CTA | Nome | Utilidade |

Templates **removidos** (não mais necessários como template separado):
- `followup` → usa `checkin` ou texto livre na janela
- `dunning` → já é por email exclusivamente
- `checkout_recovery` → já é por email
- `session_reminder` → pode usar `checkin`

### Alterações técnicas

#### 1. `supabase/functions/_shared/whatsapp-official.ts`
- Atualizar `TemplateCategory` type: remover categorias obsoletas, manter as ativas
- Na `sendProactiveMessage`: para categorias `weekly_report` e `content`, **sempre enviar como link/teaser** mesmo dentro da janela de 24h (não usar texto livre completo)

#### 2. `supabase/functions/pattern-analysis/index.ts` (Insights)
- **Mudar a lógica**: fora da janela de 24h, enviar o template `insight` com botão CTA
- Quando o usuário clicar o botão e abrir a janela de 24h, o webhook recebe a mensagem
- Adicionar lógica no `process-webhook-message` ou `aura-agent` para detectar que o usuário respondeu ao insight e entregar o conteúdo como texto livre
- **Alternativa mais simples**: salvar o insight pendente no banco (`pending_insights` ou campo em `profiles`), e quando o usuário interagir (qualquer mensagem após o template), a Aura entrega o insight na resposta

#### 3. `supabase/functions/periodic-content/index.ts` (Jornadas)
- Ajustar: mesmo dentro da janela de 24h, enviar sempre como link (teaser) — nunca o conteúdo completo
- Usar `templateCategory: 'content'` para o template de jornada

#### 4. `supabase/functions/weekly-report/index.ts` (Resumo)
- Já usa teaser com link ✅
- Ajustar `templateCategory` de `'weekly_report'` para corresponder ao novo template
- Confirmar que dentro da janela também envia com link (teaser)

#### 5. Migração SQL
- Atualizar/inserir as novas categorias na tabela `whatsapp_templates` (weekly_report, content, insight com os novos template_names)
- Remover categorias obsoletas (dunning, checkout_recovery, followup, session_reminder) ou marcá-las como `is_active = false`

#### 6. `sendProactiveMessage` — forçar link para weekly_report e content
```typescript
// Dentro de sendProactiveMessage, após checar janela:
if (windowOpen) {
  // Para weekly_report e content: sempre usar teaser (link), nunca texto completo
  if (['weekly_report', 'content'].includes(templateCategory)) {
    const messageToSend = teaserText || text;
    const result = await sendFreeText(phone, messageToSend);
    return { success: result.success, parts: 1, type: 'freetext', error: result.error };
  }
  // Para insight dentro da janela: enviar o insight completo como texto livre
  const result = await sendFreeText(phone, text);
  return { success: result.success, parts: 1, type: 'freetext', error: result.error };
}
```

#### 7. Sistema de Insight Pendente (para botão do template)
- Adicionar campo `pending_insight` (text, nullable) na tabela `profiles`
- `pattern-analysis`: ao enviar template de insight fora da janela, salvar o conteúdo em `pending_insight`
- `aura-agent`: no início da conversa, checar se há `pending_insight` → se sim, entregar o insight e limpar o campo

### Fluxo do Insight com botão

```text
1. pattern-analysis gera insight para usuário
2. Janela fechada → envia template "insight" com botão CTA
3. Salva insight em profiles.pending_insight
4. Usuário clica botão → abre janela de 24h → webhook recebe mensagem
5. aura-agent detecta pending_insight → entrega como texto livre na resposta
6. Limpa pending_insight
```

### Resumo dos arquivos alterados
1. `supabase/functions/_shared/whatsapp-official.ts` — types + lógica de envio
2. `supabase/functions/pattern-analysis/index.ts` — salvar insight pendente
3. `supabase/functions/periodic-content/index.ts` — forçar link sempre
4. `supabase/functions/weekly-report/index.ts` — confirmar link sempre
5. `supabase/functions/aura-agent/index.ts` — checar e entregar pending_insight
6. Migração SQL — atualizar `whatsapp_templates` + campo `pending_insight`

