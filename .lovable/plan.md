## Objetivo

Migrar 100% da conversa da Aura do Twilio para o número Meta novo (`+1 555-958-6099`, WABA `4389879528007597`) usando o próprio Twilio como ponte de redirecionamento — sem campanha proativa em massa, sem risco de ban.

## Lógica central

O `whatsapp-provider.ts` já respeita `profiles.whatsapp_provider` como override por usuário. A chave é: **a migração acontece no primeiro inbound do usuário no Twilio depois do flip**. Ninguém fica preso no número antigo.

## Fase 1 — Novos cadastros nascem no Meta

No fluxo de criação de perfil pós-checkout (Stripe webhook + Asaas onboarding), gravar `profiles.whatsapp_provider = 'meta'` no insert. Tudo que sai dali (welcome, sessões, jornadas) já vai pelo Meta direto. Twilio nunca toca neles.

## Fase 2 — Migração dos antigos via inbound (o coração do plano)

Para todos os perfis existentes com `whatsapp_provider` NULL ou `'official'`, fazer um único update em batch: setar `whatsapp_provider = 'meta'`.

A partir desse momento:

**Outbound (Aura → usuário)**: tudo que a Aura mandar já sai pelo Meta novo, porque o provider lê o override do profile.

**Inbound (usuário → Aura)**: o usuário ainda tem o número Twilio antigo salvo no contato. Quando ele escrever pro Twilio:
- `webhook-twilio/index.ts` detecta que o `profile.whatsapp_provider = 'meta'` (já foi flipado).
- Responde via Twilio com texto curto: *"Oi! Mudei de número 💛 Me chama aqui pra continuarmos: wa.me/15559586099"* (janela 24h aberta — é resposta direta à msg dele, sem custo de template).
- Grava `profile.twilio_redirect_notice_sent_at = now()` e NÃO processa a mensagem pelo agente (não grava em `messages`, não dispara LLM, não acumula contexto).
- Se ele insistir no Twilio dentro de 7 dias, ignora silenciosamente (não repete o aviso) pra não virar spam. Após 7 dias, pode reenviar 1x.

Resultado: a primeira vez que o usuário tentar falar com a Aura, recebe o redirect. Quando ele clicar no `wa.me`, abre conversa no Meta, manda msg, e o `webhook-meta` pega normalmente (mesmo `user_id` resolvido pelo telefone). Continuidade total.

## Fase 3 — Outbound proativo cobre quem nunca escreve

Alguns usuários podem ficar semanas sem mandar msg. Para esses, o próprio fluxo proativo já vai bater no Meta (porque o provider foi flipado na Fase 2). Como o template `welcome2`, `sessao_inicio2`, `jornada_semanal2`, `relatorio_semanal2`, `carta_mensal` já estão aprovados sem variável, o próximo proativo natural (lembrete de sessão, jornada da semana, etc.) chega pelo Meta e o usuário já tem o número novo no contato.

Não precisamos disparar um "aviso de migração" proativo dedicado — o próprio fluxo orgânico apresenta o número novo.

## Salvaguardas

- **Fallback Meta→Twilio largo** (já existe na memória `mem://technical/whatsapp/meta-twilio-fallback-broad`): se algum proativo Meta falhar (132xxx, 131xxx), cai pro Twilio antigo automaticamente. Garante que ninguém fica sem mensagem durante a transição.
- **Recuperação de carrinho** (subaccount Twilio dedicada) NÃO muda — segue isolada e continua no Twilio.
- **Reversão**: se algo der errado, basta um UPDATE setando `whatsapp_provider = NULL` que tudo volta pro Twilio.

## O que vou implementar (na ordem)

1. **`webhook-twilio/index.ts`** — após resolver `user_id`, checar `whatsapp_provider`. Se `'meta'`, enviar o aviso de redirect via Twilio (texto livre, janela aberta), marcar `twilio_redirect_notice_sent_at`, retornar 200 sem chamar o agente. Idempotência: 7 dias entre avisos.
2. **Migration** — adicionar coluna `profiles.twilio_redirect_notice_sent_at timestamptz`.
3. **Fluxo de criação de perfil** (Stripe + Asaas onboarding) — gravar `whatsapp_provider = 'meta'` no insert dos novos.
4. **Batch migration script** — UPDATE em `profiles` setando `whatsapp_provider = 'meta'` onde for NULL/`'official'`, com a opção de você rodar em lotes (ex.: 100 por vez) ou tudo de uma vez.

## Perguntas antes de implementar

1. **Texto exato do aviso**: sugiro *"Oi! Mudei de número 💛 Me chama aqui agora: wa.me/15559586099 — esse número antigo vai sair do ar em breve."* Aprovado?
2. **Batch da Fase 2**: flipa todo mundo de uma vez ou em lotes? Recomendo tudo de uma vez — o fallback Meta→Twilio cobre falhas individuais e a transição fica curta. Se preferir cauteloso, faço lotes de 100/dia.
3. **Janela de cooldown do aviso**: 7 dias entre repetições do redirect tá bom, ou prefere uma única vez (nunca repete)?

## Fora de escopo

- Não mexer em `system_config.whatsapp_provider` global (segue `'official'` como rede de segurança — override por usuário decide tudo).
- Não cancelar/desligar o número Twilio agora.
- Não criar templates novos no Meta (5 já aprovados + 1 pending bastam).
- Recuperação de carrinho WhatsApp (subaccount Twilio) intocada.
