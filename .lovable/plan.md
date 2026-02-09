

## Respeitar quando o usuario diz que nao pode falar

### Problema
Quando o usuario diz "estou no trabalho", "agora nao posso", "to ocupada", etc., a AURA entende na conversa mas os sistemas automatizados (follow-ups, check-ins, lembretes) continuam enviando mensagens normalmente, porque nao existe nenhum campo ou logica que registre que o usuario pediu para nao ser incomodado.

### Solucao: Campo `do_not_disturb_until` no profiles

Adicionar um campo `do_not_disturb_until` (timestamp) na tabela `profiles`. Quando o usuario indicar que esta ocupado, a AURA seta esse campo com um horario futuro. Todas as funcoes automatizadas checam esse campo antes de enviar.

### Mudancas

#### 1. Migration: Adicionar campo na tabela profiles

```text
ALTER TABLE profiles ADD COLUMN do_not_disturb_until TIMESTAMPTZ DEFAULT NULL;
```

Quando `do_not_disturb_until` e futuro (> now), o usuario nao recebe mensagens automatizadas.

#### 2. Nova tag no aura-agent: [NAO_PERTURBE:Xh]

No prompt do `aura-agent`, adicionar instrucoes para detectar sinais de "ocupado" e usar a tag:

```text
DETECCAO DE INDISPONIBILIDADE:
Quando o usuario indicar que nao pode conversar agora, use a tag [NAO_PERTURBE:Xh] onde X e o numero de horas estimado.

Sinais de indisponibilidade:
- "to no trabalho", "estou trabalhando"
- "agora nao posso", "nao posso falar agora"
- "to ocupada/o", "momento ruim"
- "depois te respondo", "falo contigo depois"
- "estou em reuniao"

Exemplos:
- "to no trabalho" -> "Entendi! Fica tranquila, te dou um tempo. Quando sair, me chama! 💜 [NAO_PERTURBE:4h]"
- "agora nao posso, to na correria" -> "Sem problemas! Vou ficar quietinha aqui. Me chama quando puder! 💜 [NAO_PERTURBE:3h]"
- "estou em reuniao" -> "Xiu! Fico quieta. Me manda mensagem depois! 💜 [NAO_PERTURBE:2h]"

IMPORTANTE:
- NAO insista nem faca mais perguntas quando o usuario disser que esta ocupado
- Estime o tempo de forma razoavel (trabalho = 4h, reuniao = 2h, correria = 3h)
- Se o usuario voltar a mandar mensagem ANTES do tempo, o silencio e cancelado automaticamente
```

Processamento da tag no `aura-agent`:
- Extrair X horas da tag
- Calcular `do_not_disturb_until = now + X horas`
- Atualizar na tabela `profiles`
- Limpar tag da resposta

#### 3. Cancelar silencio quando usuario volta a falar

No `aura-agent`, no inicio do processamento (antes de tudo), verificar se `do_not_disturb_until` esta setado. Se o usuario mandou mensagem, limpar o campo (setar para null), pois ele esta disponivel novamente.

#### 4. Atualizar funcoes automatizadas para checar o campo

**conversation-followup/index.ts** (linha ~369):
Apos buscar o profile, verificar:
```text
if (profile.do_not_disturb_until && new Date(profile.do_not_disturb_until) > now) {
  console.log('🔇 Skipping user - do not disturb until', profile.do_not_disturb_until);
  continue;
}
```

**scheduled-checkin/index.ts** (linha ~75):
Mesmo check antes de enviar check-in.

**scheduled-followup/index.ts** (linha ~51):
Mesmo check antes de enviar follow-up de compromissos.

**reactivation-check/index.ts** (linha ~100, seção de inativos):
Mesmo check antes de enviar mensagem de reativacao por inatividade.
Nota: lembretes de sessao (session-reminder) NAO serao bloqueados, pois sao importantes demais.

**periodic-content/index.ts** (linha ~68):
Mesmo check antes de enviar conteudo periodico (manifestos).

#### 5. Excecao: session-reminder

Lembretes de sessao (24h, 1h, 15min) NAO serao bloqueados pelo do_not_disturb, pois o usuario agendou a sessao voluntariamente e precisa ser lembrado. A notificacao de inicio de sessao tambem nao sera bloqueada.

### Fluxo

```text
Usuario: "to no trabalho"
  |
  +-- AURA: "Fica tranquila! [NAO_PERTURBE:4h]"
  |
  +-- Sistema seta do_not_disturb_until = now + 4h
  |
  +-- conversation-followup roda -> ve do_not_disturb -> SKIP
  +-- scheduled-checkin roda -> ve do_not_disturb -> SKIP
  +-- periodic-content roda -> ve do_not_disturb -> SKIP
  +-- session-reminder roda -> ENVIA NORMALMENTE (excecao)
  |
  +-- 4 horas depois -> do_not_disturb_until expirou -> mensagens voltam ao normal
  |
  OU
  |
  +-- Usuario manda mensagem antes das 4h -> aura-agent limpa o campo -> normal
```

### Resumo de arquivos modificados

1. **Migration SQL** - adicionar coluna `do_not_disturb_until`
2. **aura-agent/index.ts** - nova tag [NAO_PERTURBE:Xh], processamento, auto-clear
3. **conversation-followup/index.ts** - checar campo antes de enviar
4. **scheduled-checkin/index.ts** - checar campo antes de enviar
5. **scheduled-followup/index.ts** - checar campo antes de enviar
6. **reactivation-check/index.ts** - checar campo antes de enviar (secao de inativos)
7. **periodic-content/index.ts** - checar campo antes de enviar
