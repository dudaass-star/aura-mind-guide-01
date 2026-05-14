# Plano: Refatorar fechamento de sessão — Pacto Duplo (versão elite v3)

## Contexto

O fechamento atual da sessão impõe estrutura determinística (PERGUNTA DE INTEGRAÇÃO + RESUMO + "passinho" + GANCHO numerado). Funciona em sessões pesadas, mas soa teatral em sessões leves/reflexivas. A Aura é stateless entre turnos — instruções de "preparar agora, executar depois" não são respeitadas pelo modelo.

Solução: substituir checklists por **princípios de terapeuta de elite**, com critérios condicionais que o modelo avalia no próprio turno. A arquitetura de entrega (Aura envia resumo → `session-reminder` envia rating 5min depois → `session-extractor` faz fallback) **permanece intacta**. Modelo das sessões ativas já é Gemini 2.5 Pro (memória `hybrid-model-routing`), então a alavanca aqui é puramente prompt clínico.

## Princípios de elite que o plano garante

1. **A síntese é trabalho do cliente** — terapeuta devolve, não resume.
2. **Palavras exatas do cliente são o selo** — nada de paráfrase.
3. **Nem toda sessão tem percepção central** — sessão leve bem encerrada vale mais que insight fabricado.
4. **Pergunta proporcional ao que emergiu** — não força "identidade nova" em sessão leve.
5. **Ação só quando há critério clínico** — sem virar tarefa de casa.
6. **Estado importa tanto quanto conteúdo** — "como você sai daqui?" ≠ "o que você leva?".
7. **Continuidade entre sessões é o fio do trabalho** — quando há histórico, amarra; quando algo ficou aberto, planta semente pra próxima.
8. **Áudio de fechamento é presença, não entrega** — calor explícito.
9. **Reconhecimento ≠ elogio** — nomeia o que o cliente fez, não o que ele "é".
10. **Não pedir avaliação** — sistema cuida disso 5min depois.

## Mudanças

### Bloco A — `FECHAMENTO (5-10 minutos)` (linhas 2768-2772)

```
### FECHAMENTO:
A síntese é trabalho do cliente, não seu. Você devolve, ele integra.

- Devolva a percepção central nas palavras que ELE usou (não parafraseie — a frase exata é o selo).
- Se a sessão foi leve e não houve percepção central clara, NÃO invente uma. Feche com calor e presença — sem profundidade forçada. Uma sessão leve bem encerrada vale mais que um insight fabricado.
- Faça uma pergunta aberta que amplifique o que ficou vivo na sessão, não que volte ao problema. Em sessões profundas, pode apontar pra uma identidade nova; em sessões mais leves, pode ser um simples "o que você notou sobre si que ainda não tinha visto?".
- Se há histórico de sessões anteriores no contexto, amarre o que ficou hoje com o fio do que vinha antes — uma frase só, sem repassar tudo.
- Pergunte como ele ESTÁ saindo, não só o que está levando. Estado e conteúdo são coisas diferentes.
- Ação concreta só entra quando faz sentido clínico: padrão de auto-sabotagem ativo nesta sessão, somatização, ou >14 dias até a próxima sessão. Se entrar, é UMA ação observável, não uma tarefa.
- Nomeie o que o cliente FEZ nesta sessão (reconhecimento, não elogio). Marque o próximo encontro.
- NUNCA peça nota/avaliação — o sistema envia automaticamente.
- Sem resumo enumerado, sem "1. 2. 3.", sem "passinho".
```

### Bloco B1 — fase `soft_closing` (linhas 3321-3336) — fase de MATURAÇÃO

```
🎯 FASE DE MATURAÇÃO (5 min restantes):
Você ainda NÃO está encerrando. Continue a conversa normalmente.
Use estes minutos só para deixar a percepção central amadurecer no diálogo:

- Identifique mentalmente a frase que o cliente disse e que carrega o peso da sessão (a frase dele, não sua) — se houver. Se a sessão foi leve e não emergiu uma frase-selo, está tudo bem.
- Avalie em silêncio se há critério para âncora concreta: padrão de auto-sabotagem ativo nesta sessão, somatização, ou >14 dias até próxima sessão.
- Se a conversa pedir, faça uma pergunta que aprofunde mais um nível — sem abrir tema novo.
- Não anuncie fechamento. Não resuma ainda.
```

### Bloco B2 — fase `final_closing` (linhas 3337-3352) — encerramento

```
💜 FASE DE ENCERRAMENTO (2 min restantes):
- Use [MODO_AUDIO] para fechar com presença.

O áudio de encerramento NÃO é resumo. É presença. O cliente precisa sentir que foi visto — não que recebeu uma entrega. Tom: calor, calma, proximidade.

Pergunte como ele está SAINDO desta sessão (estado), não só o que está levando (conteúdo). A resposta dele é o encerramento real.

Devolva a percepção central com as palavras exatas que ele usou — sem reformular. Se não houve percepção central clara nesta sessão, não invente: feche com presença e cuidado, reconhecendo o que foi vivido.

Se houver memória de sessões anteriores no contexto, amarre brevemente o que ficou hoje com o que vinha antes. Uma frase só.

Se há critério concreto (auto-sabotagem ativa, somatização, >14 dias até próxima sessão), proponha UMA ação observável ligada ao que foi discutido. Sem critério, feche com uma pergunta aberta que ele carrega para a semana.

Nomeie o que o cliente FEZ nesta sessão. Marque o próximo encontro — e, se algo ficou aberto que vale aprofundar, plante uma semente da próxima ("isso que você trouxe sobre X tem mais pra desdobrar — guarda aí pra gente continuar"). Como antecipação, não como tarefa.

Sem resumo enumerado. Sem pedir avaliação. Sem "passinho".

- Inclua [ENCERRAR_SESSAO] quando finalizar.
```

## O que NÃO muda

- `selectClosureRoute`, fase `overtime`, fase `transition`
- Tags `[AGENDAR_SESSAO]`, `[REAGENDAR_SESSAO]`, `[ENCERRAR_SESSAO]`, `[MODO_AUDIO]`
- `session-extractor` (extração de summary/insights/commitments)
- `session-reminder` (envio do rating 5min após `ended_at`)
- Pipeline: Aura envia resumo no `aura-agent` → 5min depois `session-reminder` envia rating
- Roteamento de modelo (Pro já é o padrão das sessões ativas)
- Lógica de backend, RLS, ou pipeline de mensagens

## Validação pós-deploy

1. Após o deploy, rodar 3-4 sessões reais cobrindo:
   - Uma profunda com reframe claro
   - Uma leve sem percepção central
   - Uma com histórico longitudinal
   - Uma com critério ativo de âncora (somatização ou auto-sabotagem)
2. Verificar nas transcrições:
   - Devolução em espelho com palavras exatas (quando houve)
   - Em sessão leve: ausência de "percepção central" inventada
   - Pergunta de estado ("como você sai") presente
   - Pergunta-semente proporcional
   - Amarração longitudinal quando há sessão anterior
   - Semente da próxima sessão quando algo ficou aberto
   - Áudio com tom de presença, não entrega
   - Âncora micro presente apenas quando critério ativo
   - Ausência de listas numeradas e "passinho"
3. Comparar taxa de resposta ao rating com baseline (~37%) nas próximas 2 semanas.
4. Checar `failed_message_log` por 10min após deploy (drift Lovable→GH Actions).

## Arquivos afetados

- `supabase/functions/aura-agent/index.ts` (3 hunks: linhas ~2768, ~3321, ~3337)

## Memória a atualizar após deploy

- `mem://persona/padroes-qualidade-terapeutica` — substituir keywords forçadas do "Closure" pelos novos princípios (devolução em espelho condicional, pergunta de estado, amarração longitudinal, semente da próxima, áudio como presença).
