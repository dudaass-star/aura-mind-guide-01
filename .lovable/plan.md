# Convite D0 sumindo após WELCOME — race condition no fast-path

## O que aconteceu com o Anderson Costa

Linha do tempo (timestamps reais do banco):
- 01:47:37 — usuário clica "Começar" no template
- 01:47:43 — fast-path entrega WELCOME e seta `pending_first_session_invite=true`
- **01:48:03 — Aura envia "Bora! 💜" (assistant)** ← anomalia: mensagem extra, sem convite D0
- 01:48:28 — usuário responde "Estou um pouco melhor..."
- 01:48:47 em diante — Aura pula para "vamos organizar as 4 sessões do mês" (fluxo `needs_schedule_setup`)

Ou seja: o convite à 1ª sessão D0 nunca foi disparado. Aura foi direto para o setup mensal — exatamente o que a guarda em `aura-agent/index.ts:5874` deveria impedir. A flag `pending_first_session_invite` está `false` no banco agora, então **alguma coisa consumiu a flag silenciosamente entre 01:47:43 e 01:48:28**, sem produzir o convite.

## Causa raiz: race condition fast-path × LLM paralelo

O fast-path em `aura-agent/index.ts:4290-4337` entrega o WELCOME direto via WhatsApp e retorna `fastPath: true`, mas o webhook/worker tem um padrão de re-acumulação pós-agente. A mensagem "Bora! 💜" é a impressão digital disso: um segundo turno do LLM rodou logo após o fast-path, dentro do mesmo evento "Começar". Esse segundo turno:

1. Leu o profile já atualizado (`pending_first_session_invite=true`)
2. Caiu no bloco D0 (linha 5748) → **limpou a flag** (linha 5755)
3. Mas o usuário ainda não tinha mandado mensagem real → LLM produziu só "Bora! 💜" sem emitir `[AGENDAR_SESSAO]`
4. Quando o Anderson de fato escreveu ("Estou um pouco melhor..."), a flag já estava `false` → guarda em 5874 não bloqueou mais → entrou o setup mensal

Confirma o diagnóstico:
- Não existe nenhum log `🎯 Injetando convite à 1ª sessão (D0)` para esse user (busquei).
- A "Bora! 💜" às 01:48:03 não tem mensagem do usuário entre 01:47:37 e 01:48:28 que a justifique.
- A flag está `false` no banco mesmo sem o convite ter sido feito.

## Mudanças propostas

### 1. Limpar flag SOMENTE quando o convite for de fato emitido
Em `aura-agent/index.ts:5748-5759`, mover o `update({ pending_first_session_invite: false })` para depois da resposta da Aura, condicionado à presença da tag `[AGENDAR_SESSAO:` OU à confirmação de que o turno realmente convidou (heurística simples: response contém "sessão" + emitiu tag, OU usuário recusou explicitamente). Hoje a flag é zerada antes do LLM responder, então qualquer falha (race, recusa, desvio) queima o convite para sempre.

Padrão a seguir: só limpar a flag quando:
- A resposta gerada contém `[AGENDAR_SESSAO:` (aceite confirmado), OU
- Já passaram N (3-4) interações desde que a flag foi setada (anti-loop), OU
- O usuário explicitamente desconversou do convite

### 2. Bloquear D0 quando turno não tem mensagem real do usuário
Em `aura-agent/index.ts:5748`, adicionar guarda: só injetar o bloco D0 se `message?.trim()` existir e não for o próprio click "Começar" (mesmo padrão do `isButtonClick` em 4286). Isso impede que o segundo turno paralelo do worker queime o convite com uma resposta vazia tipo "Bora! 💜".

### 3. Fast-path: marcar `last_content_sent_at` para criar janela de cooldown
Adicionar em `aura-agent/index.ts:4313-4319` uma flag/timestamp tipo `welcome_delivered_at` (ou reusar `last_content_sent_at` já existente) e fazer o LLM principal abortar qualquer execução paralela nos N segundos seguintes ao fast-path do WELCOME. Já existe lógica de lock em `aura_response_state` — verificar por que ela não está prevenindo este turno extra e reforçar.

### 4. Recuperar o Anderson Costa manualmente
- Re-armar `pending_first_session_invite=true` no profile dele
- Como ele já está em conversa avançada de setup mensal (já confirmou dias e horários), o re-arme aqui seria confuso. **Recomendo NÃO re-armar** — a 1ª sessão dele já está marcada para sábado 09/05 às 21h. Apenas registrar como caso documentado e seguir.

### 5. Auditoria dos demais novos usuários
Rodar query nas últimas 48h: profiles com `created_at` recente, `pending_first_session_invite=false` e SEM nenhuma sessão criada em até 30 min após o `trial_started_at`. Esses são os que sofreram o mesmo bug. Re-armar os que ainda não estão em conversa avançada.

## Arquivos afetados

- `supabase/functions/aura-agent/index.ts` — linhas ~4313, ~5748-5759, ~5874
- DB: UPDATE pontual em `profiles` para usuários elegíveis identificados na auditoria
- `mem/features/sessions/first-session-invite-d0.md` — documentar a regra "limpar flag só após emissão da tag" e o anti-race do fast-path

## Validação pós-deploy

- Próximo trial novo: log `🎯 Injetando convite à 1ª sessão (D0)` deve aparecer **na primeira mensagem real** do usuário (não no clique "Começar")
- Não deve aparecer mensagem solta tipo "Bora! 💜" entre WELCOME e primeira resposta real
- Bloco `# 📅 CONFIGURAÇÃO DE AGENDA DO MÊS` não deve ser injetado enquanto convite D0 não foi resolvido (com tag emitida ou recusa explícita)
