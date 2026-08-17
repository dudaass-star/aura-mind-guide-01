# Sessão grátis — versão enxuta (sem plano novo, sem tabela nova)

A ideia dá pra rodar reusando o que já existe. Nada de plano novo no Stripe/Woovi, nada de tabela nova, nada de checkout.

O truque: os **tiers de retenção que já existem** (`profiles.plan_tier`) já entregam exatamente o que a sessão grátis precisa.

- `plan_tier = 'lite'` → 1 sessão/mês + 15 min de áudio (já implementado no aura-agent)
- `plan_tier = 'base'` → 0 sessões, 30 mensagens/mês, permanente, com parede e banner de upgrade (já implementado)

Então: **sessão grátis = perfil com `lite` por poucos dias → depois cai pra `base`**. O lead ganha a sessão, e depois continua com um acesso mínimo que já vem com convite pra assinar. Zero código novo de cobrança ou entitlement.

## Etapa 1 — Piloto manual (praticamente sem código)

Roda já, e serve pra medir se a oferta converte antes de automatizar.

1. O `recovery-agent` ganha uma tag nova `[OFERECER_SESSAO_GRATIS]` no prompt + 1 item na base de conhecimento explicando a oferta (1 sessão de 45 min, agendada no WhatsApp, sem cartão).
2. Regras da oferta ficam no prompt: só a partir da 2ª resposta, só se o lead demonstrou dúvida real, nunca em "não quero", nunca antes de falar preço, uma vez por lead.
3. Quando o lead aceita, a conversa é marcada como `needs_human` com motivo próprio (o campo já existe) e aparece pra você no Inbox de Recuperação.
4. Você libera o acesso pelo painel de usuários (perfil com `plan_tier = 'lite'`) e a Aura conduz o agendamento normalmente pelo fluxo de tags que já existe.

Custo: um trecho de prompt, um item de KB, uma linha de log. Nenhum fluxo novo.

## Etapa 2 — Automatizar só se o piloto converter

Aí sim, o mínimo:

- 1 coluna em `profiles`: `free_session_claimed_at` (serve de trava anti-abuso e de relógio).
- Aceite do lead cria o perfil já com `plan_tier = 'lite'` e grava a data — sem passar por checkout.
- No cron diário que já existe, uma regra: perfil com `free_session_claimed_at` há mais de 2 dias e sem assinatura ativa → vira `base`. Fim do acesso ampliado, sem cancelamento, sem cobrança.

## O que eu deixaria de fora agora

- **Follow-up de leads antigos**: precisa de template WhatsApp aprovado novo. Vale, mas é outra frente — depois do piloto.
- **Sessão grátis como 2ª/3ª mensagem automática pra todo abandono**: continua não recomendado (teto vitalício de 2 envios por telefone + canibalização do R$ 6,90).

## Guardas (valem nas duas etapas)

- 1 sessão grátis por telefone, sem repetição.
- Nunca oferecer pra quem é ou já foi assinante pagante.
- Grátis é a segunda saída: só depois de explicar e o lead ainda hesitar.

## Detalhes técnicos

- `recovery-agent/index.ts`: nova tag no parse (`sendLink/escalate/stop` + `offerFree`), elegibilidade calculada no backend (nº de respostas, ausência de perfil pagante) e injetada no contexto como "pode/não pode oferecer" — o LLM não decide isso sozinho.
- `recovery_agent_config.system_prompt`: objetivo da oferta, sem frase pronta (mantém o padrão atual anti-robótico).
- `recovery_knowledge_base`: 1 item novo, categoria `objecao`.
- Entitlement: reuso puro de `plan_tier` no `aura-agent` (linhas ~4700-4712). Nada muda no agente.
- Agendamento: reuso do contrato de tags `[AGENDAR_SESSAO:YYYY-MM-DD HH:MM]`.
- Etapa 2: coluna `free_session_claimed_at` + regra no cron diário existente.
