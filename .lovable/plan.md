
# Diagnóstico: sumiço antes do fechamento é canal ou é qualidade?

## Hipótese

No WhatsApp, parte do abandono é estrutural (a pessoa é interrompida por vida real e não volta na mesma janela). Outra parte é qualidade da Aura (perdeu o fio, ficou repetitiva, interpretou errado, não aterrissou). Sem separar as duas, qualquer conclusão vira achismo.

## O que investigar (só leitura, sem mudar nada)

Vou rodar 5 recortes no banco sobre as sessões dos últimos 30 dias, cruzando `sessions`, `messages` e os novos campos de fechamento (`closure_mode`, `last_interaction_closure_state`).

### 1. Onde a pessoa some (mapa de calor por fase)
Contar sessões que terminaram sem fechamento agrupadas pela **fase ativa no momento da última mensagem** (abertura / exploração / reframe / fechamento).
- Se concentra em **abertura/exploração** → provável qualidade (não engajou).
- Se concentra em **reframe/fechamento** → provável canal (a pessoa recebeu o valor e saiu).

### 2. Tempo até o sumiço
Distribuição do gap entre última mensagem da Aura e o silêncio, comparado com duração total da sessão.
- Sumiço nos primeiros 5 min = fricção inicial.
- Sumiço perto dos 45 min = fadiga / sessão longa demais.
- Sumiço espalhado = ruído de canal.

### 3. Quem é o último a falar
Ratio de sessões silenciosas onde a **última mensagem foi da Aura** vs. **do usuário**.
- Aura última → alta chance de a pessoa não ter achado o que responder (pergunta ruim, bloco denso, interpretação errada).
- Usuário última → pessoa foi interrompida (sinal de canal).

### 4. Padrões da Aura nas 3 últimas mensagens antes do sumiço
Amostra qualitativa de 20 sessões silenciosas: ler as últimas trocas e classificar em:
- Interpretação prematura / leitura psicológica assertiva
- Bloco muito longo (>4 balões, muito denso)
- Pergunta genérica ("como você se sente com isso?")
- Repetição do que o usuário disse
- Aterrissagem tentada mas ignorada
- Nada aparente (canal)

Esse é o passo que separa "qualidade" de "canal" de verdade.

### 5. Retorno pós-sumiço
Dos usuários que sumiram em uma sessão, quantos voltam a conversar com a Aura em até 72h?
- Alto retorno → canal (a vida atravessou, mas a relação está viva).
- Baixo retorno → qualidade (a pessoa saiu e não teve motivo pra voltar).

## Entregável

Um único relatório em chat com:
- Números dos 5 recortes.
- Veredito por eixo: **canal / qualidade / misto**.
- Se houver eixo de qualidade dominante, lista curta de 2–3 correções específicas (não plano genérico) — ex.: "encurtar reframe quando a fase muda antes de 3 pares", "banir pergunta X que aparece em 40% dos sumiços".

## Fora do escopo

- Nenhuma alteração de código, prompt ou schema nesta rodada.
- Não vou reabrir M1–M4; isso aqui é diagnóstico do que sobrou depois deles.

Aprova rodar o diagnóstico?
