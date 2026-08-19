# Aura útil no dia a dia + corte de assunto em 30 min

Sim — retomar continua possível. O histórico recente permanece no contexto em qualquer faixa abaixo de 48h; a regra de 30 min não apaga nada, só muda **quem escolhe o assunto**. Se o usuário voltar e puxar o tema anterior, a Aura tem tudo em mãos e retoma de onde parou.

Nenhum modo novo, nenhum detector novo, nenhum KPI novo.

## O que hoje impede

O `MODO PING-PONG` já existe e já desliga os guardrails de profundidade. O problema é que ele está escrito como "reagir breve e devolver a bola" — não autoriza **responder de fato**. E não há nenhuma linha dizendo que pergunta prática deve ser respondida como pergunta prática. Resultado observado em conversa real de 16/08: usuária pergunta "pilates faz mais efeito que musculação?" e a Aura responde "o que eu tô vendo aqui é que você tá se esforçando pra caramba..." — ela nunca respondeu a pergunta.

## Parte 1 — Os 3 ajustes de utilidade

### 1. Uma regra de utilidade dentro do PING-PONG (que já existe)
Acrescentar 3 ou 4 linhas ao bloco que já está lá:
- Pergunta prática (dúvida, informação, ideia, receita, dica, opinião, "como faz X") → **responde a pergunta**, direto e útil, como uma amiga que sabe do assunto.
- Responder é a entrega. Não precisa de gancho emocional, nem de pergunta de volta, nem de leitura psicológica.
- Não devolver a pergunta como material clínico. Se houver algo emocional de verdade por trás, ela responde primeiro e só depois, se couber, comenta em uma frase.
- Saúde/jurídico/financeiro: opinião informada + sugerir profissional, nunca como verdade.

### 2. Trocar o exemplo errado por um certo
A seção Anti-Rodeio já ensina brevidade. Ganha um exemplo de utilidade no mesmo formato dos que já estão lá, usando o caso real do pilates: pergunta prática → resposta prática.

### 3. Uma frase de contrapeso na Postura Clínica
Hoje ela lê `Você não é assistente do humor do usuário. Você é a presença clínica dele.` Fica, mas com uma frase ao lado: ser presença inclui ser companhia e ser útil no dia comum; profundidade é quando a pessoa traz peso, não a marcha default.

## Parte 2 — Corte de assunto aos 30 min (fora de sessão)

Hoje o contexto temporal só fala quando o gap passa de 4h. Abaixo disso nada é dito, e o modelo tende a puxar o assunto pesado anterior de volta.

Novo comportamento, só quando **não** há sessão agendada rodando:

```text
< 30 min    continuação imediata (igual hoje)
30 min-4h   NOVA regra: a mensagem atual do usuário define o assunto.
            Responde o que ele trouxe agora, não reabre o tema anterior
            por conta própria. Se ELE retomar, retoma com naturalidade
            e com toda a memória do que já foi dito.
4h+         faixas atuais (4-24h, 24-48h, 48h+) sem mudança
```

Dentro de sessão agendada nada muda — lá a lógica de retomada e as 4 fases continuam mandando.

## O que NÃO muda

- Nada dentro de sessão agendada.
- Nenhum guardrail de profundidade é enfraquecido: em tema pesado, tudo continua igual.
- Histórico, insights e memória continuam carregados — retomar é sempre possível.
- Sem código novo, sem tabela, sem cron, sem painel.
- Protocolo de segurança e limites (não dar orientação médica/jurídica como verdade) continuam valendo — a regra de utilidade diz explicitamente pra ela não passar de opinião informada nesses casos.

## Detalhe técnico

Em `supabase/functions/aura-agent/index.ts`:
- edições de texto: bloco `## MODO PING-PONG` (~3081-3090), regra `Anti-Rodeio` (~2813-2815), bloco `# POSTURA CLÍNICA` (~2823).
- bloco `CONTEXTO TEMPORAL SERVER-SIDE` (~5975-6002): baixar o gatilho de `temporalGapHours >= 4` para `>= 0.5`, com instrução própria para a faixa 0,5-4h e guarda `!sessionActive` nessa faixa.

Depois, redeploy do `aura-agent` e checagem de `failed_message_log`, conforme o padrão de deploy do projeto.