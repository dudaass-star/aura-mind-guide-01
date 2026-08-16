# Agente de recuperação: explicar o PIX Automático de forma humana e tranquilizadora

## O que a conversa do Alberto mostra

O lead disse duas coisas, na ordem:
1. "era um valor menor para fazer uma experiência" → ele quer **testar**.
2. "quando eu avanço com o Pix dá valor de 29 daí não quero" → ele viu **R$ 29,90 na tela do banco** e entendeu como cobrança de agora.

O agente respondeu com preço + link. Correto nos fatos, frio na comunicação: não deixou claro que o valor cheio que o banco mostra é só a autorização das próximas mensalidades (não sai hoje), não tranquilizou e não falou de experimentar. Foi a mensagem manual do admin que fez esse trabalho.

Duas causas, as duas corrigíveis:
- **A base não tem o item da dúvida real.** Existe item sobre "o que é Pix Automático" e sobre quando debita, mas nenhum que ataque de frente "apareceu o valor cheio na tela do banco, vou ser cobrado agora?".
- **O prompt manda ser preciso e seco.** Ele diz literalmente "precisão vence simpatia", "não explore sentimento", "máximo 3 frases", e não pede o número concreto do que sai hoje. O resultado é o robô que você viu.
- **O agente não recebe os números do plano dele.** O contexto que a função monta hoje manda só "plano essencial (monthly)", sem os valores — então ele fala em faixas ou genérico em vez do valor exato daquele lead.

## O que vai ser feito

### 1. Injetar os valores do plano do lead no contexto
A função passa a calcular, a partir do plano/ciclo do checkout, e mandar no bloco de contexto: valor da 1ª semana daquele plano, valor mensal daquele plano, data aproximada do 1º débito (8º dia). Assim o agente fala "R$ 6,90 / R$ 29,90" para Essencial, "R$ 9,90 / R$ 49,90" para Direção e "R$ 19,90 / R$ 79,90" para Transformação — sem número chumbado no prompt e sem confundir planos.

### 2. Base de conhecimento: os itens que faltam sobre PIX Automático
Novos itens em `duvida_tecnica`, na linguagem de quem está com o app do banco aberto:
- "Apareceu o valor cheio do plano na tela do banco — vou pagar isso agora?" → não: hoje sai só a 1ª semana; o valor do plano é a autorização e só entra no 8º dia. Prioridade máxima. Escrito com marcador de valor, sem número fixo, pra valer nos três planos.
- "Vi dois valores na tela, é cobrança dupla?" → um é o pagamento da semana, o outro é o mandato.
- "É seguro autorizar cobrança automática no meu banco?" → é o Pix Automático do Banco Central, revogável por você no app, sem fidelidade.
- "Como cancelo antes do 8º dia?" → botão no site, 1 minuto, sem falar com ninguém; e a autorização no banco cai junto.
- "Se eu cancelar dentro dos 7 dias, o banco debita?" → não; a autorização morre com o cancelamento.
- "Por que o PIX Automático é bom pra mim?" → não precisa cartão, não guarda dados de cartão, você mesmo controla e revoga no app do banco.

Ajustar também os itens de `garantia`/`pagamento` para sempre trazerem **os valores dos três planos** (1ª semana 6,90 / 9,90 / 19,90 · mensal 29,90 / 49,90 / 79,90), em vez de "1ª semana promocional" solto.

### 3. Prompt do agente: objetivos, não frases prontas
Reescrever o `system_prompt` de `recovery_agent_config` mantendo todas as travas de verdade (nada inventado, sem upsell, sem atendimento humano, sem terapia). A mudança é de **método**, não de roteiro — o prompt vai definir o que a mensagem precisa **conseguir**, e deixar as palavras para o agente:

Objetivos de uma resposta sobre cobrança/PIX Automático:
- o lead entende que **hoje sai só o valor da 1ª semana** e que o valor do plano é autorização futura;
- o lead entende **quando** o valor cheio entra (8º dia) e que dá pra sair antes sem pagar;
- o lead sente que pode **experimentar** de verdade, não que está comprando um mês;
- o lead percebe o PIX Automático como algo que **ele controla** (revoga no app do banco), não como armadilha.

Regras de estilo, sem texto fixo:
- Usar os números que vierem no contexto (nunca inventar nem usar valor de outro plano).
- Escrever com as palavras do próprio lead quando ele der uma pista ("experiência", "testar", "não quero").
- **Proibido reutilizar frase-modelo**: nenhuma abertura padrão, nenhum bordão, nenhuma explicação copiada de mensagem anterior. Se já explicou, explica por outro ângulo.
- Tom de quem tranquiliza com fato, não com adjetivo; sem "que ótima pergunta", sem entusiasmo publicitário.
- Quem escolheu PIX escolheu PIX: **não empurrar cartão**. Se travar, resolver o medo do débito automático ali mesmo.
- Não repetir link nem argumento: nova objeção → nova resposta, fechando com uma pergunta concreta.
- Tamanho livre até ~5 frases curtas quando a trava é compreensão do PIX Automático; conciso nos outros casos.
- "Precisão vence simpatia" sai; entra "precisão **com** acolhimento".

O prompt vai trazer 1-2 exemplos marcados explicitamente como **referência de tom, proibido copiar**, justamente para não virar template.

### 4. Checkout: uma linha a mais no modal do PIX
Na tela do QR, uma linha destacada acima das instruções, com os valores do plano escolhido: "Hoje sai R$ {1ª semana}. O R$ {mensal} que o banco mostra é a autorização das próximas mensalidades — só entra no 8º dia." Mesma ideia do agente, pra quem não abandona também não se assustar.

## Detalhes técnicos
- `supabase/functions/recovery-agent/index.ts`: mapa plano→(trial, mensal) alinhado ao `CheckoutV2.tsx`, novo bloco "VALORES DO PLANO DESTE LEAD" no `contextBlock`, e rodapé pedindo objetivo em vez de estrutura fixa. Nenhuma mudança de fluxo/guardas/Twilio.
- `INSERT` dos novos itens em `recovery_knowledge_base` (`duvida_tecnica`, prioridade 96-99 no item do valor na tela do banco) e `UPDATE` nos itens de garantia/pagamento com os valores dos três planos. `duvida_tecnica` já está em `ALWAYS_CATEGORIES`, então entram em todo prompt.
- `UPDATE recovery_agent_config SET system_prompt = ... WHERE id = 1` — sem mexer em `enabled`, `model`, `max_auto_replies`, silent hours.
- Copy em `src/pages/CheckoutV2.tsx` (bloco do QR PIX, ~linhas 2013 e 2099), usando `currentPlan.trialPrice` e `currentPrice` já disponíveis.
- Fonte de verdade dos valores: `src/lib/plan-pricing.ts` + mapa de trial do `CheckoutV2.tsx`.
- Memória do projeto atualizada: valores sempre por plano, nunca chumbados no prompt; sem oferta de cartão para quem escolheu PIX; prompt por objetivo, sem frases prontas.

## Fora do escopo (posso fazer depois)
O bug do telefone gravado sem o 9 (`555184068922` vs `5551984068922`), que duplicou a conversa no inbox e escondeu histórico do agente.