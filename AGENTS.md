# Decisões técnicas
- Card migration reuses the payment callback, separate from plan changes; only full-tier Woovi customers qualify (legacy mandates and retention pricing unsupported).
- Subscription exit styling is scoped to `.subscription-exit` and reuses portal tokens; this keeps public and authenticated cancellation consistent without changing billing or other App screens.
- App subscription management uses the isolated portal client and a server-validated JWT subject; retention offers are rendered one at a time with an independent cancellation exit, so neither identity nor cancellation depends on client-supplied phone numbers or rejected offers.
- PIX retention tiers share a cent-based price helper and force monthly cadence for reduced tiers; this prevents Base from falling back to full-plan prices or inheriting an annual mandate.

- The conversation card, chat header, empty chat and voice-message portraits share the approved asset pointer; preserve the original portrait for unrelated screens to keep visual changes scoped.

- Voice-message reading state stays outside playback and its toggle shares the duration/receipt row; opening persisted text never loads, regenerates or plays audio, and collapsed messages stay compact.

- Conversation design experiments are removed once integrated into the App; this prevents obsolete public preview pages from shipping.

- Blog covers stay in private storage and render through existing signed links; only the generation service accesses the bucket directly, preventing unrestricted client downloads.

- Contas de demonstração usam `profiles.status = 'demo'`, com direito de acesso apenas ao App e sem telefone/cobrança; isso permite separar personagens fictícios de clientes ativos em rotinas e indicadores.
- Demo sharing uses protected individual seven-day invites; sessions start on click, without extending normal links.
- Chat errors share descriptors; retry only transient failures to prevent terminal resends.
- Mobile chat inherits visualViewport-adjusted container height; avoid inner 100dvh so keyboard cannot hide input.
- Record home-icon launches in `portal_value_events` only after authentication and standalone detection; admin reads the latest launch, never inferring installation from browser use.
- O PortalAuthProvider isola a sessão admin e serializa o vínculo; consolidação transacional só ocorre se a identidade antiga já não existe.
- A tela de entrada do App é carregada dinamicamente, mas o download começa antecipadamente quando o caminho começa com /meu-espaco, reduzindo a espera visual.
- Pedidos explícitos de encerrar uma sessão aceitam artigos e pronomes entre o verbo e “sessão/encontro”; isso reconhece a fala natural sem transformar despedidas comuns em encerramento.
- A avaliação de uma sessão concluída é solicitada na própria conversa do App e registrada pelo fluxo autenticado de experiência; isso não depende de telefone nem do pós-sessão no WhatsApp.
- Sessões em andamento mudam suavemente o contexto visual da conversa e mostram progresso no cabeçalho; o aviso de fechamento nunca entra como mensagem da AURA.
- Chat wallpaper shares identical organic, three-scale SVG geometry across casual and light-stroke session variants, with wrapped edge copies and equal tile dimensions; this prevents visible grid seams while preserving each background's contrast.
- AURA evita confirmação ritual e perguntas seguidas; revelação nova mantém Presença e impede fechamento por tempo.
- O fio entre encontros fica separado de compromissos e é retomado sem tarefa artificial.
- PIX: sonda só diagnostica; o checkout bloqueia apenas com `pix_gateway=off` e reconcilia pela mesma identidade.
- O Movimento Olá Aura separa alcance, primeira conversa e continuidade; participação pública é opcional e reconhecimento não usa ranking comercial.
- Movement attribution is claimed at global App authentication; Mural requires individual consent, preserving impact and privacy.
- Movement has a single membership: joining (`movement_members`) unlocks the personal invite; `ambassador_since` is legacy and auto-filled by trigger so attribution keeps working.
- Movement onboarding is a single one-tap join before any form; launch highlights remain until joining, and demo Mural/Kit content stays admin-only to protect public data.
- Chat latency uses `chat_turn_metrics.performance_breakdown`: `preparation_stages_ms` separates profile, quota, agenda, session and context; audio download/transcription, provider, handling and persistence remain separate to locate bottlenecks.
- Chat reconciliation reads messages independently from response state, with bounded waits and an overlap window; prevents hidden persisted replies.
- Full-turn latency ends after processing and the last bubble renders, separate from first-bubble latency.
- App processing skips the legacy WhatsApp instance; only WhatsApp uses it, avoiding unnecessary network waits.
- Disputas PIX vinculam a cobrança pelo End-to-End ID tanto em campos diretos quanto no payload original, recusando associação ambígua; isso preserva a defesa automática sem atribuir evidência ao cliente errado.
- Meta buyer sync: daily, additive, idempotent, hashed, no demos.
- Woovi reconciliation exhausts ascending pagination and links a different payer only through exact installment E2E, prioritizing prior payer relationships; this avoids heuristic attribution.
- Chat thinking stays low except in session reframe, development, transition and closure phases, cutting latency.
- Parallelize independent chat reads after profile, quota and sessions; reduce waits without changing context.
- Movement is collective-first; local previews share live invite copy.
- Home keeps tracking; practice dialogs stop audio on exit.

- Revenue splits potential/coverage; churn unions paid people, using official E2E and contract dates to avoid cross-plan attribution. Headline churn counts only people with a paid full installment (base = recurring on day 1 + those converting during the month); paid-week drop-off is measured only by the D+7 conversion cohort, so trials never inflate churn.
- Stripe invoice classification separates prorations from monthly conversions; plan swaps update descriptions without changing cash history.
<!-- LOVABLE:BEGIN -->
- Support ingestion uses bounded UID reads and lightweight MIME parsing; message-level deduplication and human review prevent lost mail and unintended sends.
<!-- LOVABLE:END -->

- Chat recovery is persisted on accepted turns, claimed with leases, bounded in time and attempts, and unscheduled after drain; this survives worker loss without replaying old topics.
- Session inactivity closure checks unanswered App turns and pauses at the operational cap; this prevents technical silence from counting as therapeutic completion.
- Free trial (`status='degustacao'`): a DB trigger makes the courtesy quota-exempt, consumed only by an active or dialogued session (interrupted: up to 2 fresh restarts), and blocks later plan-less starts; chat outside a session is blocked deterministically.
- The `oracoes` plan reuses the degustação wall (DB trigger + aura-agent) with reason `oracoes_cortesia`; one courtesy session then upgrade, so access rules live in one place.
- Active sessions load chat history from 15 min before session start (cap 200), not the casual 40-row window; Aura replies split into many rows, so 40 rows lost the session's opening.
- Support renewals for existing PIX customers use the customer's own /reautorizar-pix link plus a pre-generated copy-paste code (reused while valid); /v2 is only for first-time buyers, so returning customers never re-enter the new-customer checkout.
- Today tab hero is chosen by one pure selector (`src/lib/today-hero.ts`, BRT, night 20h30–05h59) over raw `heroSignals` from today-direction; cards only render the chosen state, so screens never stack equal-priority cards.
- Hoje → Retomar com a AURA never prefills the composer; it stores a temporary session reference sent with the first message, validated server-side and injected as context; keeps the client's own words and the mic available.
- After a paid client rates a session, the app proposes the next one at the same time shifted by the plan rhythm (`src/lib/next-session.ts`), only when nothing is scheduled; limits there must match `manage_portal_session_internal`.
- Woovi recurring debits arrive as `OPENPIX:TRANSACTION_RECEIVED` (`subType: PIX_AUTOMATIC`) or `cobr` objects, confirmed against the remote installment and deduplicated across all its aliases (`cobr.identifierId` and paid E2Es); late-reconciled payments buy coverage from their paid date, and the audit re-registers required webhooks (create via `/api/openpix/v1/webhook`) every run, so money that entered is never invisible nor counted twice.
- Woovi access cap allows a 28-day recovery grace after the paid cycle only while the mandate is alive; involuntary declines must not cut members during bank retries, while cancellations still end at the paid period.
- The `/quiz` acquisition page composes its reading from fixed, reviewed copy per answer (`src/lib/quiz/content.ts`) and keeps answers only on the device; Meta and funnel events carry step names only, never emotional answers.
- Quiz entry invitations share the initial offer selector and scoped quiz/payment tokens; this keeps the advertised entry price aligned with the selected cycle without changing the standalone checkout.
- In the night theme, `main > section` is forced transparent to kill the zebra effect; a section that must carry its own colored band needs the `.v5-band` class, otherwise the global rule silently erases its background.
- Aura voice files stay in the private TTS bucket for users with App access (cleanup only drops shared leftovers and files of users without access); the App gets renewable links via `aura-audio-url` and regenerates from the message text when a file is gone, so history audio never dies yet storage doesn't grow for churned users.

- Plan-change cycle choices and annual savings use the shared pricing helpers while legacy billing cycles remain readable; this keeps the two-choice interface consistent without rewriting existing contracts.

- The plan-change dialog loads Nunito from the installed font package; local font files avoid failed external font requests and inconsistent fallback typography.
- Capacitor appId `br.com.olaaura.app` is fixed; store builds bundle `dist`, live reload only via `CAP_LIVE_RELOAD=1`.
- Support cancels route by the customer's real provider, not the action label; Asaas is no longer the PIX rail.
