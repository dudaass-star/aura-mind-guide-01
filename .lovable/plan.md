# Dúvidas rápidas do checkout: de FAQ defensivo para copy que dá vontade de falar com a AURA

Hoje o bloco abaixo do CTA responde objeções de forma correta, mas fria: fala de robô, cancelamento e criptografia. É informação, não desejo. A proposta é manter a função de tirar o freio de mão e, no mesmo espaço, mostrar como é conversar com a AURA.

## O que muda

1. **Primeiro item deixa de ser sobre robô e passa a ser sobre a experiência.**
   Em vez de se defender ("Vou falar com um robô?"), abre mostrando o que acontece quando a pessoa manda a primeira mensagem: resposta na hora, no WhatsApp, sem agenda, sem sala de espera, e alguém que lembra da conversa de ontem. A negação do robô entra dentro da resposta, como consequência — não como manchete.

2. **Cancelamento vira liberdade, não saída.**
   Mesma informação (1 clique, sem justificativa, 7 dias de garantia), enquadrada como "você não está assinando um compromisso, está começando uma conversa".

3. **Privacidade vira intimidade.**
   O valor real não é "criptografia": é poder dizer o que não se diz para ninguém. A resposta abre por aí e fecha com os fatos técnicos (conversa privada, pagamento via Stripe/Asaas, cartão nunca armazenado, email só para recibo e acesso).

4. **Novo item: "Como é a primeira conversa?"**
   Item curto que descreve os primeiros minutos — ela pergunta o que está pesando agora, você responde em texto ou áudio, e sai dali com uma leitura e um próximo passo concreto. Esse é o item que gera vontade.

5. **Título da seção e microcopy.**
   "Dúvidas rápidas" → algo que convide a ler (ex.: "Antes de começar"), com uma linha de apoio curta acima do accordion.

6. **Primeiro item aberto por padrão.**
   Como o item 1 passa a ser vendedor (e não uma objeção), ele abre por padrão no desktop para ser lido sem clique. Quem já decidiu continua com o CTA acima, sem interrupção.

## Detalhes técnicos

- Alteração isolada em `src/components/checkout/CheckoutObjections.tsx`: array `ITEMS` reescrito (4 itens), `defaultValue` no `Accordion` para abrir o primeiro, e ajuste do label/microcopy do topo.
- Sem mudança de preço, gateway, tracking ou layout do checkout. Tokens `--ck-*` existentes continuam sendo usados; nenhuma cor nova.
- Tom PT-BR informal, frases curtas, sem promessa terapêutica ou de resultado clínico.
