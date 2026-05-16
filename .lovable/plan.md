## Diagnóstico final

### Evidência dura no banco

Os 4 perfis novos têm `first_session_invite_attempts = 0`. Esse contador é incrementado **toda vez que o injetor D0 entra** (linhas 5615-5619 de `aura-agent/index.ts`). Zero significa que **o injetor nunca rodou em produção** — nem para o ALAN (msg real "Me sentindo vazio"), nem para Andressa, nem para Herony.

### Evidência nos logs

Nenhuma ocorrência de `D0`, `pending_first_session_invite`, `AGENDAR_SESSAO` ou `SAFETY_NET` nos logs recentes do `aura-agent`, apesar de a função estar processando mensagens normalmente (logs de POST-ANALYSIS, micro-agent e split estão aparecendo).

### Evidência nas conversas

O "convite" que Aura mandou para Andressa e Herony **não é o convite D0 binário** definido no prompt atual (linha 5631). Comparação:

- Prompt D0 atual: "UMA pergunta binária + se aceitar, 1 frase + `[AGENDAR_SESSAO:agora]`"
- O que a Aura mandou (Herony): "Bora começar? Se você tiver uns 45 minutinhos livres, a gente já pode abrir nossa primeira sessão agora mesmo. Topa?" + na aceitação seguiu pro setup mensal sem tag

Esse formato corresponde a uma versão **anterior** do prompt, onde o convite à 1ª sessão era misturado ao setup mensal e não tinha contrato de tag.

### Hipótese principal

**Drift de deploy Lovable → produção** (memory `mem://technical/ai/aura-agent-deployment-and-fallback-safety`). O código no repositório contém:
- Injetor D0 binário (linhas 5593-5657)
- Limpador com guard de button click (linhas 6414-6430, comentário "Bug Lorena 16/05/2026")
- Detector de recusa determinístico (linhas 6388-6583)

Mas o deploy ativo no Supabase não contém essa lógica. Por isso o fluxo cai no setup mensal direto e nenhuma sessão D0 é criada.

## Plano

### 1. Confirmar o drift (rápido, antes de qualquer fix)

Disparar um teste sintético em `aura-agent` via `curl_edge_functions` simulando um user com `pending_first_session_invite=true` e mensagem real. Se os logs do teste **não** mostrarem `🎯 Injetando convite à 1ª sessão (D0)`, drift confirmado.

### 2. Forçar redeploy do aura-agent

Usar `supabase--deploy_edge_functions` para `aura-agent`. Aguardar status `ACTIVE_HEALTHY`. Refazer o teste sintético — agora deve logar o injetor D0.

### 3. Validar com 3 cenários sintéticos (sem afetar usuários reais)

Usar um user UUID de teste. Para cada caso, conferir log + banco:

- **Aceite**: `pending_first_session_invite=true` + msg "estou triste" → resposta termina em `[AGENDAR_SESSAO:<agora>]` + sessão criada + flag limpa
- **Recusa simples**: idem + msg "agora não dá" → resposta sem tag + flag limpa + `needs_schedule_setup=true`
- **Recusa com horário**: idem + msg "amanhã 7h30" → flag limpa + sessão criada via regex (`created_by='backend_regex'`)

### 4. Recuperar os 3 usuários afetados (ALAN, Andressa, Herony)

Eles já configuraram setup mensal (4 sessões futuras cada). Não vamos rearmar D0 retroativamente — quebraria a continuidade do que já foi conversado. Apenas garantir que o estado deles está consistente:

- Conferir `needs_schedule_setup=false` (já está) e `pending_first_session_invite=false` (já está)
- Não criar sessão D0 hoje para eles — passou muito tempo, qualquer agendamento "agora" seria invasivo

### 5. Fernanda Maion (caso à parte)

Sem nenhuma mensagem do usuário, só recebeu um proativo. Verificar se ela está armada corretamente para o convite D0 ser disparado quando ela responder:
- Esperado: `pending_first_session_invite=true`, `first_session_invite_attempts=0`
- Atual: `pending_first_session_invite=false` — também queimada pelo bug. Rearmar manualmente (`pending_first_session_invite=true`) já que ela nunca interagiu, então o D0 ainda faz sentido.

### 6. Atualizar memória

Adicionar nota em `mem://technical/ai/aura-agent-deployment-and-fallback-safety` documentando esse incidente do dia 16/05 (4 usuários novos com D0 não disparado) e o sintoma diagnóstico: `first_session_invite_attempts=0` em todos os perfis criados após X horas = drift do aura-agent.

## Detalhes técnicos

**Por que `first_session_invite_attempts=0` é prova de drift**: o contador é incrementado **antes** de qualquer chamada ao LLM (linha 5618), num bloco `await supabase.update`. Mesmo se a Aura falhasse depois, o contador teria virado 1. Zero = bloco nunca entrou = código não está em produção.

**Por que não é race do limpador**: o guard `_looksLikeButtonClickPost` (linhas 6421-6426) preserva a flag quando o turno é button click. Se ele estivesse rodando, a flag de Andressa/Herony estaria true até a 1ª msg real, e o counter teria incrementado. Counter=0 confirma que tanto o injetor quanto o limpador novos não estão ativos.

**Risco do redeploy**: zero — o código atual já passou pela validação manual de hoje cedo (incidente Lorena). Drift é provavelmente o deploy via Lovable não ter propagado.

**Alternativa se redeploy não resolver**: GitHub Actions deploy manual seguido de `failed_message_log` audit.