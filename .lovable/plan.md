# Aura útil no dia a dia (ajuste enxuto de prompt)

Faz total sentido. Se a pessoa usa a Aura pra tirar dúvida, pedir uma ideia, uma receita, uma opinião — ela abre o WhatsApp da Aura por hábito, não só quando está mal. Isso é exatamente o que sustenta LTV: a assinatura deixa de ser "gasto de quando eu não estou bem".

E dá pra fazer simples: **nenhum modo novo, nenhum detector novo, nenhum KPI novo.** Só três ajustes de texto no prompt, dentro de seções que já existem.

## O que hoje impede

O `MODO PING-PONG` já existe e já desliga os guardrails de profundidade. O problema é que ele está escrito como "reagir breve e devolver a bola" — não autoriza **responder de fato**. E não há nenhuma linha dizendo que pergunta prática deve ser respondida como pergunta prática. Resultado observado em conversa real de 16/08: usuária pergunta "pilates faz mais efeito que musculação?" e a Aura responde "o que eu tô vendo aqui é que você tá se esforçando pra caramba..." — ela nunca respondeu a pergunta.

## Os 3 ajustes

### 1. Uma regra de utilidade dentro do PING-PONG (que já existe)
Acrescentar 3 ou 4 linhas ao bloco que já está lá:
- Pergunta prática (dúvida, informação, ideia, receita, dica, opinião, "como faz X") → **responde a pergunta**, direto e útil, como uma amiga que sabe do assunto.
- Responder é a entrega. Não precisa de gancho emocional, nem de pergunta de volta, nem de leitura psicológica.
- Não devolver a pergunta como material clínico. Se houver algo emocional de verdade por trás, ela responde primeiro e só depois, se couber, comenta em uma frase.

### 2. Trocar o exemplo errado por um certo
A seção Anti-Rodeio já ensina brevidade. Ganha um exemplo de utilidade no mesmo formato dos que já estão lá, usando o caso real do pilates: pergunta prática → resposta prática.

### 3. Uma frase de contrapeso na Postura Clínica
Hoje ela lê `Você não é assistente do humor do usuário. Você é a presença clínica dele.` Fica, mas com uma frase ao lado: ser presença inclui ser companhia e ser útil no dia comum; profundidade é quando a pessoa traz peso, não a marcha default.

## O que NÃO muda

- Nada dentro de sessão agendada.
- Nenhum guardrail de profundidade é enfraquecido: em tema pesado, tudo continua igual.
- Sem código novo, sem tabela, sem cron, sem painel.
- Protocolo de segurança e limites (não dar orientação médica/jurídica como verdade) continuam valendo — a regra de utilidade diz explicitamente pra ela não passar de opinião informada nesses casos.

## Detalhe técnico

Três edições de texto em `supabase/functions/aura-agent/index.ts`: bloco `## MODO PING-PONG` (~3081-3090), regra `Anti-Rodeio` (~2813-2815), bloco `# POSTURA CLÍNICA` (~2823). Depois, redeploy do `aura-agent` e checagem de `failed_message_log`, conforme o padrão de deploy do projeto.