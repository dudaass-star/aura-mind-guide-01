# Remover o onboarding faseado da primeira sessão

## Por quê

Os dados de 313 sessões concluídas (99 com nota) mostram que a primeira sessão é consistentemente pior que as seguintes:

- 1ª sessão: média **4,47** (5 notas ≤3 em 49)
- 2ª+ sessão: média **4,80** (2 notas ≤3 em 50)
- Pior em **todos** os meses com dados (mai/jun/jul/ago)
- `focus_topic` preenchido em **1 de 136** primeiras sessões

A causa é estrutural: o onboarding é um roteiro de 5 fases escolhido por contagem de mensagens da Aura, e a fase 5 ("definir o foco") não tem condição de saída. Quando a conversa chega nela, o sistema injeta em **todos** os turnos a ordem literal "OBJETIVO: escolher por onde começar" — foi isso que fez a Aura repetir a mesma pergunta 5 vezes para a Marilene. Somado a isso, o bloco manda "não pule fases" e "volte ao onboarding gentilmente", o que atropela quem já trouxe um tema pronto.

A condução normal (Abertura → Exploração → Reframe → Fechamento) já sabe acolher, entender contexto, manter foco e descer de profundidade — e é ela que produz as notas melhores.

## O que muda

**1. Sai o roteiro de fases**
Remover as 5 fases do onboarding e as regras "não pule fases / volte ao onboarding". A primeira sessão passa a rodar pela mesma condução das demais.

**2. Entra uma nota curta de primeira sessão**
No lugar do roteiro, um bloco de poucas linhas com apenas o que é factual e útil:
- é a primeira sessão formal com essa pessoa;
- abrir com calor e explicar o formato em **uma** frase, sem checklist;
- entender o panorama de vida antes de interpretar (regra de higiene de interpretação que já existe);
- se a pessoa já chegou com um tema, trabalhar esse tema — não puxar de volta para apresentações.

**3. Nada muda no resto do ciclo**
Continuam iguais: a marcação de `onboarding_completed` ao fim da primeira sessão, a extração de perfil da conversa (experiência prévia, desafios, expectativas, estilo preferido) e o uso desses dados nas sessões seguintes. A remoção é só do roteiro de condução, não da coleta de dados.

## Fora de escopo

As outras falhas que mapeamos (menções literais a minutos no prompt, pedido de nota atropelando a despedida, resíduo visual `. . .` no split) ficam para um ajuste separado, para não misturar mudanças.

## Detalhes técnicos

- Arquivo: `supabase/functions/aura-agent/index.ts`, bloco `firstSessionContext` (linhas ~6024-6128).
- Elimina a variável `assistantMessagesInSession` e o switch de `onboardingPhase` — com isso desaparece o bug de contagem (a variável contava mensagens de toda a conversa, incluindo o agendamento pré-sessão, então a sessão frequentemente já começava na fase 5).
- Mantém intactos: `isFirstSession`, o bloco de extração pós-sessão (~8172) e o bloco "CONHECIMENTOS DO ONBOARDING" para sessões futuras (~6234).
- Rodar os testes unitários existentes do `aura-agent` e republicar a edge function.
- Acompanhamento: comparar a média das primeiras sessões nas 2 semanas seguintes contra a linha de base de 4,47.
