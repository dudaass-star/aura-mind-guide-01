# Decisões técnicas

- Contas de demonstração usam `profiles.status = 'demo'`, com direito de acesso apenas ao App e sem telefone/cobrança; isso permite separar personagens fictícios de clientes ativos em rotinas e indicadores.
- Demo sharing uses protected individual seven-day invites; sessions start on click, without extending normal links.
- Chat errors share descriptors; retry only transient failures to prevent terminal resends.
- Mobile chat inherits visualViewport-adjusted container height; avoid inner 100dvh so keyboard cannot hide input.
- Record home-icon launches in `portal_value_events` only after authentication and standalone detection; admin reads the latest launch, never inferring installation from browser use.
- O PortalAuthProvider isola a sessão admin e serializa o vínculo; consolidação transacional só ocorre se a identidade antiga já não existe.
- A tela de entrada do App permanece no pacote principal, sem carregamento dinâmico; isso impede tela branca por arquivo de versão anterior após uma atualização.
- Pedidos explícitos de encerrar uma sessão aceitam artigos e pronomes entre o verbo e “sessão/encontro”; isso reconhece a fala natural sem transformar despedidas comuns em encerramento.
- A avaliação de uma sessão concluída é solicitada na própria conversa do App e registrada pelo fluxo autenticado de experiência; isso não depende de telefone nem do pós-sessão no WhatsApp.
- Sessões em andamento mudam suavemente o contexto visual da conversa e mostram progresso no cabeçalho; o aviso de fechamento nunca entra como mensagem da AURA.
- AURA evita confirmação ritual e perguntas seguidas; revelação nova mantém Presença e impede fechamento por tempo.
- O fio entre encontros fica separado de compromissos e é retomado sem tarefa artificial.
- PIX: sonda só diagnostica; o checkout bloqueia apenas com `pix_gateway=off` e reconcilia pela mesma identidade.
- O Movimento Olá Aura separa alcance, primeira conversa e continuidade; participação pública é opcional e reconhecimento não usa ranking comercial.
- Movement attribution is claimed at global App authentication; Mural requires individual consent, preserving impact and privacy.
- Participante e Embaixador são papéis distintos; link, divulgação, impacto e conquistas de indicação exigem adesão voluntária registrada em `movement_members.ambassador_since`.
- Movement onboarding presents the cause and role choice before the form; launch highlights remain until joining, and demo Mural/Kit content stays admin-only to protect public data.
- Chat latency uses `chat_turn_metrics.performance_breakdown`: `preparation_stages_ms` separates profile, quota, agenda, session and context; audio download/transcription, provider, handling and persistence remain separate to locate bottlenecks.
- Chat reconciliation reads messages independently from response state, with bounded waits and an overlap window; this prevents stalled state reads and sequence gaps from hiding persisted replies.
- Full-turn latency ends after processing and the last bubble renders, separately from first-bubble latency; this distinguishes delivery cadence from technical delay.
- App processing skips the legacy WhatsApp instance; only WhatsApp uses it, avoiding unnecessary network waits.
- Disputas PIX vinculam a cobrança pelo End-to-End ID tanto em campos diretos quanto no payload original, recusando associação ambígua; isso preserva a defesa automática sem atribuir evidência ao cliente errado.
- Meta buyer sync is daily, additive and idempotent with normalized hashed identity and no demos; preserve history.
- Woovi reconciliation exhausts ascending pagination and links a different payer only through exact installment E2E, prioritizing prior payer relationships; this avoids heuristic attribution.
- Chat thinking stays low except in session reframe and closure to reduce latency without losing reflection.
- Parallelize independent chat reads after profile, quota and sessions; reduce waits without changing context.
- Movement is collective-first; local previews share live invite copy.
- Prayers share one catalog/player to keep art, audio and cues matched.
- Prayer lyrics use cue-relative progress and measured visible bounds for long-line scrolling; this keeps all words readable without shrinking text or moving playback controls.
- Home keeps tracking; practice dialogs stop audio on exit.

- Revenue splits potential/coverage; churn unions paid people, using official E2E and contract dates to avoid cross-plan attribution.
- Stripe invoice classification separates prorations from monthly conversions; plan swaps update descriptions without changing cash history.
<!-- LOVABLE:BEGIN -->
- Support ingestion uses bounded UID reads and lightweight MIME parsing; message-level deduplication and human review prevent lost mail and unintended sends.
<!-- LOVABLE:END -->

- Chat recovery is persisted on accepted turns, claimed with leases, bounded in time and attempts, and unscheduled after drain; this survives worker loss without replaying old topics.
- Session inactivity closure checks unanswered App turns and pauses at the operational cap; this prevents technical silence from counting as therapeutic completion.
