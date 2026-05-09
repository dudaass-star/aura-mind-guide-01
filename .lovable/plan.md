# Re-auditoria honesta das sessões e novos usuários de hoje

## Por que este plano existe
Minha análise anterior afirmou "0 sessões, sistema quebrado, rating 2/10" — estava **errado**. A verificação correta mostra **9 sessões completadas em 36h, 6 ratings 5★ (100% das avaliadas)**. Você também confirmou via Stripe que **hoje entraram 5 usuários novos** (não 9 como meu filtro de 36h sugeriu — os outros 4 são de ontem).

Preciso refazer a auditoria com queries dedicadas e separar claramente: (a) o que está funcionando bem, (b) bugs reais isolados, (c) bugs sistêmicos — sem misturar.

## Escopo
Apenas leitura de banco, Stripe e logs. Sem alterar código, sem migration. Entregável: relatório consolidado e, se houver bug real, plano separado para sua aprovação.

## Etapas

### 1. Identificar os 5 novos usuários reais via Stripe
- Cruzar `customers` criados hoje (BRT) no Stripe com `profiles` no banco via email/phone.
- Listar os 5 com: nome, plano, hora signup, hora 1ª mensagem, hora última mensagem.
- Descartar os "falsos novos" do meu filtro anterior (signups de 07/05 que entraram na janela de 36h).

### 2. Inventário real das sessões de hoje (08/05 BRT)
- Todas as sessões com `ended_at`, `started_at` ou `scheduled_at` em 08/05 BRT.
- Por sessão: usuário, plano, status, duração, áudios, resumption, rating, summary truncado.
- Métricas: completion rate, no_show rate, cancelled rate, rating médio, distribuição por plano.

### 3. Avaliação qualitativa das sessões completadas
- Estrutura clínica (Presença → Significado → Movimento) presente nos summaries.
- Profundidade vs. ping-pong superficial.
- `commitments` e `key_insights` preenchidos.
- Sinalizar áudios fora do padrão (=0 ou >4).

### 4. Auditoria dos 5 novos usuários D0
Para cada um:
- Quantos `[AGENDAR_SESSAO:]` reais foram emitidos (regex em `messages`).
- Quantas tags inválidas/inventadas (`[CRIAR_AGENDA`, `[MARCAR`, `[AGENDA_SEMANAL`).
- Estado final de `pending_first_session_invite` e `first_session_invite_attempts`.
- Reminder em `scheduled_tasks` sem sessão correspondente em `sessions` (órfão).
- Safety Net D0 (`schedule-tag-extractor`) foi disparado? Quando?

### 5. Caso Claudia em detalhe (se confirmado entre os 5)
- Reler janela completa onde Aura emitiu `[CRIAR_AGENDA:...]`.
- Confirmar se a tag inválida vazou ao usuário ou foi sanitizada.
- Identificar instrução ambígua no prompt que induziu a hallucination.

### 6. Erros de gateway — impacto real
- Cruzar `failed_message_log` (últimas 24h) com lista de sessões completadas.
- Separar erros já corrigidos (`meditationCatalog`) dos ativos (`upstream connection`).
- Confirmar se algum dos 5 novos usuários foi afetado.

### 7. Entregável
Relatório em chat com:
- Métricas reais com query mostrada para cada número.
- Lista de bugs **confirmados** (com timestamp, user_id, evidência).
- Lista de bugs **descartados** pela re-análise.
- Recomendação só se algum bug real persistir, como plano separado.

## Restrições
- Não inventar dados: cada número vem de query mostrada.
- Não alterar código nem banco neste passo.
- Distinguir "padrão sistêmico" de "caso isolado".
- Usar Stripe como fonte de verdade para "novos usuários hoje" (= 5).
