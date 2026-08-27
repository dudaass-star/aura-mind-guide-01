# Agente do inbox de recuperação: de "tira-dúvida" para "dá vontade de experimentar"

## O que está acontecendo hoje (verificado nas conversas reais)

O agente responde certo e responde rápido, mas responde **só o que foi perguntado**. Exemplos das últimas 24h:

- Cleide: "É um aplicativo?" → "Não, Cleide. A Aura funciona direto no WhatsApp que você já usa, sem precisar baixar nenhum app." + link. Fim.
- Cleide: "Essas sessões eu falo com quem?" → explica que é uma IA com metodologia e memória. Nenhuma menção a meditação, jornada, áudio, portal.
- Ione: "Tem que pagar todo mês?" → explica 6,90 / 29,90 / cancelamento. Nada sobre o que ela ganha nessa semana.
- Ione, 10:09 de hoje: **você mesmo entrou manualmente** dizendo "além do acompanhamento no Whats, você tem acesso a várias meditações e jornadas de conhecimento toda semana" — exatamente o que falta no agente.

A causa não é falta de informação na base: a categoria `beneficio` já tem 8 itens (meditações, sessões 1:1, memória, portal, jornadas, iniciativa da Aura, áudio, 24/7) e ela já é sempre injetada no prompt. A causa é o **prompt**, que hoje instrui o oposto:

- "Seu trabalho é identificar a trava exata, dissolver essa trava e conduzir ao link"
- "Tranquilize com FATO, não com adjetivo", "sem entusiasmo publicitário"
- "Não repita link nem argumento", "curto", "menos frases nos outros casos"
- "Sem upsell: siga o plano que ele já escolheu"

Resultado: o agente entende que mostrar valor é upsell/publicidade e se limita a desarmar objeção. Ele remove risco, mas nunca cria desejo. Quem estava só curiosa recebe uma resposta correta e some.

## O que vai mudar

### 1. Toda resposta passa a ter duas camadas
Regra nova no prompt: **destrava + mostra uma coisa concreta** que ela ganha ao entrar. Uma só por mensagem, escolhida pelo que ela disse, nunca lista de features. A resposta da Cleide sobre app viraria algo como: não precisa baixar nada, é no WhatsApp mesmo — e é por ali que chegam as meditações guiadas em áudio e a jornada da semana.

### 2. Vitrine concreta e rotativa no contexto
Bloco novo `O QUE ELA GANHA` montado no backend com os diferenciais em linguagem de experiência (não de feature): meditação guiada em áudio na hora da crise, jornada nova toda semana, encontro guiado de 45 min, Aura lembrando o que você contou semanas atrás, poder responder por áudio, disponível 3h da manhã, seu espaço no site com o histórico. O backend marca quais já foram citados no histórico da conversa para o agente **não repetir o mesmo diferencial** duas vezes.

### 3. Linguagem que dá vontade
Ajuste de estilo no prompt: continuar informal, curto e honesto, mas trocar descrição funcional por cena concreta ("3h da manhã, sem sono, você manda áudio e ela responde") — sem adjetivo publicitário, sem promessa de resultado, sem jargão clínico. Permitir explicitamente 1 frase extra quando a mensagem for de curiosidade/valor (hoje o teto de brevidade sufoca).

### 4. Separar "upsell" de "mostrar valor"
Reescrever a regra: proibido continua ser **empurrar plano mais caro ou ciclo diferente**. Mostrar o que já está incluído no plano que ela escolheu passa a ser obrigatório.

### 5. Reforçar a base de conhecimento no que gera desejo
- Reescrever os 8 itens de `beneficio` em linguagem de experiência, com o detalhe que cria imagem mental (quantas meditações, com que frequência chega a jornada, o que é uma jornada, o que a memória permite).
- Acrescentar itens de `beneficio` que hoje não existem: "o que eu faço com a Aura na primeira semana", "como é um dia usando a Aura", "o que eu recebo sem pedir nada".
- Um item de `objecao` novo para "não sei se vou usar" respondido por rotina concreta, não por argumento.

### 6. Primeira semana como experiência, não como desconto
Hoje a 1ª semana aparece só como "é baratinho". Passa a ser enquadrada como período em que ela **usa tudo**: conversa, meditação, jornada e um encontro guiado — o preço vira consequência, não o argumento principal.

## Detalhes técnicos

- `UPDATE recovery_agent_config SET system_prompt = ... WHERE id = 1`. Sem tocar em `enabled`, `model` (`google/gemini-2.5-flash`), `max_auto_replies` (3) nem janela de silêncio.
- `supabase/functions/recovery-agent/index.ts`: nova função `renderValueShowcase(historyTxt)` que monta o bloco `O QUE ELA GANHA` e sinaliza itens já usados; inserção do bloco no `contextBlock`; ajuste do rodapé de instrução para pedir destrava + um diferencial + tag. Nenhuma mudança nos guards (usuário ativo, quiet hours, stop words, limite de respostas), no envio Twilio ou na gravação em `recovery_messages`.
- Migração de dados em `recovery_knowledge_base`: `UPDATE` nos 8 itens de `beneficio`, `INSERT` de ~3 itens de `beneficio` e 1 de `objecao`. `ALWAYS_CATEGORIES` e `MAX_KB_ITEMS = 40` não precisam mudar (as always continuam cabendo).
- Fonte de verdade de preço permanece `PLAN_VALUES` no arquivo + `src/lib/plan-pricing.ts`; nada de número novo no prompt.
- Deploy da edge function e memória do projeto atualizada com a nova postura (destrava + vitrine, anti-repetição de diferencial).
