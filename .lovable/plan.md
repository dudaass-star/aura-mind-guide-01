
# Repaginação do /meu-espaco — Espelho Vivo da relação com a Aura

Transformar o portal de catálogo passivo em espaço vivo de retenção. Nova ordem de abas: **Hoje → Sessões → Insights → Sobre Você → Jornadas → Meditações**.

## Aba "Hoje" (nova — landing principal)

Cards dinâmicos, na ordem:

1. **Saudação contextual** — "Bom dia, {nome}" + última interação com a Aura ("Vocês conversaram há 2h").
2. **O que ficou da última sessão** (substitui "micro-passo")
   - Mostra o `closure` da sessão concluída mais recente, **independente do formato** (tese, encruzilhada, leitura, experimento, pergunta-pra-carregar, escolha-binária, micro-passo).
   - Título do card adapta ao formato:
     - `pergunta-pra-carregar` → "Pergunta pra carregar"
     - `leitura` → "Leitura da Aura"
     - `experimento` → "Experimento dessa semana"
     - `escolha-binária` → "Escolha aberta"
     - `tese` → "Tese da Aura"
     - `encruzilhada` → "Encruzilhada"
     - `micro-passo` → "Próximo passo"
     - fallback (sem tipo) → "O que ficou da última sessão"
   - Botão adapta:
     - pergunta/leitura → "Responder pra Aura" (deep link WhatsApp)
     - experimento/escolha-binária/micro-passo → "Contar pra Aura como foi"
     - tese/encruzilhada → "Continuar essa conversa"
3. **Próxima sessão** — data/hora BRT + countdown + botão "Reagendar pelo WhatsApp".
4. **Último insight da Aura** (Efeito Oráculo) — frase + data, com "Ver todos os insights".
5. **Meditação sugerida** — escolha contextual (tag mais recente do usuário). Botão "Ouvir agora".
6. **Citação/frase da semana** (opcional, do relatório mensal).

**Empty state** (usuário novo sem sessão): card "Sua primeira sessão" com convite e CTA WhatsApp.

## Aba "Sessões"

- Card grande "Próxima sessão" no topo.
- Contador do mês: "3 de 4 sessões usadas no plano Essencial".
- Lista cronológica de sessões concluídas: data, tema, reframe curto, fechamento (com badge do formato), rating do usuário.
- Clique abre detalhe expandido (summary completo, reframe, closure).
- Empty state para quem ainda não fez sessão.

## Aba "Insights" (substitui parcialmente "Resumos")

- Timeline de insights do Efeito Oráculo + cápsulas do tempo entregues.
- Bloco "Padrões dessa semana / desse mês" (extraído de `monthly_reports.analysis_text` + tags recorrentes).
- Botão "Compartilhar" em cada insight (gera card visual).
- Empty state: "A Aura ainda está te conhecendo".

## Aba "Sobre Você" (substitui parcialmente "Resumos")

Conhecimento curado que a Aura tem do usuário, agrupado por prioridade da `user_memories`:

- **Identidade** (prioridade 10)
- **Valores** (7–9)
- **Temas recorrentes** (tags agregadas)
- **Marcos da jornada** (timeline determinística: 1ª sessão, primeira meditação, X sessões, etc.)
- **Evolução emocional** (gráfico simples do relatório mensal).

Cada item tem "Corrigir" / "Remover" via WhatsApp (deep link com texto pré-preenchido).

## Aba "Jornadas" (polida)

- Busca + filtro por duração.
- Marker "Já ouvi" / "Em andamento".
- Seção "Recomendadas pra você" no topo (baseado em tags).

## Aba "Meditações" (polida)

- Busca + filtro por duração/categoria.
- Marker "Já ouvi".
- "Sugeridas agora" no topo.

## Floating CTA

Botão flutuante "Falar com a Aura" presente em todas as abas (deep link WhatsApp para o número oficial).

---

## Mudanças técnicas

### Banco

- **Migration**: adicionar `closure_type TEXT` em `public.sessions` (valores: `tese | encruzilhada | leitura | experimento | pergunta-pra-carregar | escolha-binaria | micro-passo`). Nullable, sem default.
- **Nova tabela `public.user_insights`**: `user_id`, `insight_text`, `source` (`oraculo | session | capsula`), `delivered_at`, `metadata jsonb`. RLS por token de portal (mesmo padrão de `monthly_reports`) + GRANTs (`authenticated`, `service_role`, `anon` só onde policy permite via token).
- **Nova tabela `public.user_milestones`** (computada): `user_id`, `milestone_type`, `achieved_at`, `metadata`. Preenchida por edge function determinística.

### Edge functions

- `session-extractor` (já existe): passar a popular `closure_type` via tool calling (Flash-lite).
- `efeito-oraculo-*` (já existe): gravar em `user_insights` toda vez que entrega um insight.
- **Nova** `compute-user-milestones`: determinística, roda diária via cron, agrega marcos.
- **Nova** `extract-user-themes`: Gemini Flash-Lite, agrega tags recorrentes das últimas N sessões.
- **Nova** `portal-today`: agrega tudo da aba Hoje em 1 request (última sessão + closure, próxima sessão, último insight, sugestão de meditação, saudação).

### Frontend

- Refatorar `src/pages/UserPortal.tsx` para 6 abas na nova ordem.
- Componentes novos em `src/components/portal/`:
  - `HojeTab.tsx` (orquestrador de cards)
  - `cards/UltimaSessaoCard.tsx` (com lógica de título/botão por `closure_type`)
  - `cards/ProximaSessaoCard.tsx`
  - `cards/UltimoInsightCard.tsx`
  - `cards/MeditacaoSugeridaCard.tsx`
  - `SessoesTab.tsx`
  - `InsightsTab.tsx`
  - `SobreVoceTab.tsx`
  - `FloatingWhatsAppCTA.tsx`
- Reaproveitar `JornadasTab`, `MeditacoesTab` (adicionar busca + markers).
- Deletar `ResumosTab.tsx` (conteúdo migra).
- Tokens semânticos do design system (sem cores hardcoded).

### Fora de escopo

Fluxos de pagamento, comportamento da Aura no WhatsApp, novos meios de pagamento, login passwordless.

---

## Fases de entrega

1. **Fase 1** — Migration (`closure_type`, `user_insights`, `user_milestones`) + refator do frontend com 6 abas usando dados já existentes (sessões, monthly_reports, user_memories, time_capsules, próxima sessão). Card "O que ficou" usa `closure` atual; quando `closure_type` for null, mostra título genérico.
2. **Fase 2** — `session-extractor` populando `closure_type`; `efeito-oraculo-*` gravando em `user_insights`; aba Insights ganha dados reais.
3. **Fase 3** — `extract-user-themes` + `compute-user-milestones`; aba "Sobre Você" ganha temas e marcos automáticos.
4. **Fase 4** — Polimento: busca/filtros em Jornadas e Meditações, "Recomendadas pra você", compartilhamento de insights.
