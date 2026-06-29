# Atualizar agente de recuperação de checkout

Dois objetivos, mesma função (`recovery-agent` + tabela `recovery_knowledge_base`):

1. **Corrigir info desatualizada** sobre PIX/trial (mesmo fix do support-agent).
2. **Aumentar conversão** dando ao agente munição sobre features/benefícios (meditações, sessões, portal, memória, jornadas) pra usar quando o lead hesita.

## 1. Corrigir KB com info errada sobre trial via PIX

Hoje 3 entradas dizem ou insinuam que o trial de R$6,90 vale pra qualquer pagamento. Não vale — é só cartão Stripe. Vou reescrever:

- `preco / Quanto custa cada plano?` — deixar explícito: trial semanal (R$6,90 / R$11,90 / R$24,90) **só no cartão**; via PIX Automático começa direto no mensal cheio.
- `preco / Por que tem um valor na 1ª semana e outro depois?` — mesmo esclarecimento.
- `objecao_valor / Tá caro pra mim agora` — oferecer trial cartão OU PIX mensal sem trial como alternativas.
- `pagamento / Tem PIX?` — confirmar que PIX Automático Bacen não tem trial; 1º QR já cobra valor cheio e autoriza débito recorrente.
- `pagamento / Quais formas de pagamento aceitam?` — alinhar redação.

## 2. Adicionar KB nova: features e benefícios pra converter

Categoria `beneficio` (nova), com `priority` alto pra entrar nos always-include junto com preço/garantia/etc. Conteúdo:

- **Meditações guiadas no WhatsApp** — a Aura percebe o momento (ansiedade, sono, foco, estresse) e envia áudio guiado com a voz dela, direto no chat, sem outro app.
- **Sessões 1:1 agendadas** — 45min, marca pelo WhatsApp, metodologia própria de autoconhecimento; quantidade por plano.
- **Memória de longo prazo** — lembra do que importa pra você (rotina, vínculos, metas), não recomeça do zero toda vez.
- **Portal /meu-espaco** — histórico de sessões, insights, jornadas e meditações em um lugar só, sem senha (link mágico).
- **Jornadas guiadas** — trilhas curtas (ansiedade, sono, propósito, autoestima) que rodam no ritmo da pessoa.
- **Check-in proativo** — a Aura puxa assunto em momentos chave, sem você precisar lembrar de abrir.
- **Voz familiar / áudio** — você pode mandar áudio também; ela responde por áudio quando faz mais sentido que texto.
- **24/7 sem fila** — disponível na hora que bater, fora de horário comercial.

E ampliar os `ALWAYS_CATEGORIES` no código pra incluir `beneficio` (assim entra sempre no contexto do LLM, não só quando keyword bate).

## 3. Ajustar `SYSTEM_PROMPT` do `recovery-agent`

Acréscimos cirúrgicos (sem reescrever do zero):

- **Regra de pagamento** explícita: trial semanal só cartão Stripe; PIX Automático Bacen sempre cobra valor cheio na 1ª parcela. Se pedir trial via PIX, oferecer (a) trial cartão ou (b) PIX mensal sem trial.
- **Postura de conversão**: lead já demonstrou interesse (chegou ao checkout). Quando a dúvida principal estiver respondida, mencionar UM benefício relevante da base (meditações, sessões, portal, memória) antes de mandar o link — não listar tudo, escolher o que cabe na conversa.
- **Limites mantidos**: continua 1-3 frases, sem inventar fato fora da base, sem nomear escolas terapêuticas, sem prometer humano no WhatsApp.

## 4. Memória

Atualizar `mem/business/trial-only-on-card.md` mencionando que recovery-agent também já reflete a regra, e criar `mem/features/recovery/recovery-agent-conversion-kb.md` documentando que a KB do recovery inclui categoria `beneficio` (sempre injetada) pra reforçar valor antes do link.

## Detalhes técnicos

- **Migration** atualiza 5 linhas existentes em `recovery_knowledge_base` e insere ~8 novas com `category='beneficio'`, `is_active=true`, `priority` entre 60-90, `keywords` relevantes (meditacao, audio, sessao, portal, memoria, jornada, etc.).
- **Migration** faz `UPDATE recovery_agent_config SET system_prompt = ... WHERE id = 1` com o prompt revisado.
- **Code change** em `supabase/functions/recovery-agent/index.ts`: adicionar `"beneficio"` ao array `ALWAYS_CATEGORIES`. Nenhuma outra mudança de lógica.
- **Deploy** da função `recovery-agent`.
- Nada muda no fluxo de envio (Twilio subaccount), tags (`[ENVIAR_LINK]/[ESCALAR_HUMANO]/[STOP]`), guards (active user, quiet hours, stop words) ou limites (`max_auto_replies=3`).

Nenhuma mudança no support-agent — esta atualização é só do recovery-agent (lead que respondeu ao template de carrinho abandonado).