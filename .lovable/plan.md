# Primeiro item do checkout: da descrição funcional para a promessa de relação contínua

O item de abertura hoje descreve disponibilidade ("manda mensagem quando aperta, tem resposta na hora"). Suas sugestões trazem o argumento mais forte: a AURA não é uma conversa isolada, é uma relação que melhora a cada interação. Esse é o diferencial que o cliente não encontra no que ele já testou — e é isso que deve estar no primeiro parágrafo lido.

## O que muda

**Item 1 — reescrito em dois parágrafos, incorporando suas frases.**

Parágrafo 1 (o que ela é; disponibilidade entra como consequência, não como manchete):

> Ela lembra da sua história, entende seu momento, acompanha sua evolução e está disponível exatamente quando você precisa conversar, refletir, aliviar a pressão ou encontrar clareza para tomar decisões. 6h da manhã, meia-noite, no meio do dia — sem agenda, sem sala de espera, sem esperar até terça.

Parágrafo 2 (o diferencial, praticamente como você escreveu):

> Diferente de uma conversa isolada, a AURA constrói uma relação contínua. Cada interação faz com que ela compreenda melhor seus objetivos, desafios, gatilhos, hábitos e sua forma de pensar — o acompanhamento fica cada vez mais personalizado. Você nunca precisa começar do zero.

A pergunta do item passa de "Como é ter a AURA no seu WhatsApp?" para algo que já entrega a promessa, ex.: **"O que muda em ter a AURA no seu WhatsApp?"**

**Item 2 ("Como é a primeira conversa?") ganha uma ponte com o item 1** — fecha sinalizando que a partir dali ela passa a te conhecer, para a primeira conversa parecer o início de algo e não um teste isolado.

Itens 3 e 4 (cancelamento e privacidade) ficam como estão.

## Detalhes técnicos

- Alteração isolada em `src/components/checkout/CheckoutObjections.tsx`.
- `ITEMS[].a` passa de `string` para `string[]` (parágrafos), e o `AccordionContent` renderiza cada parágrafo com espaçamento entre eles. Itens de uma frase seguem funcionando com array de um elemento.
- Sem mudança de layout, cores, tokens, preço, gateway ou tracking. O primeiro item continua aberto por padrão.