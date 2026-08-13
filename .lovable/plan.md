# Landing /v2 no Clarity: o lead clica em cima, não lê a página

## O que o CSV entrega (e o que não entrega)

O arquivo é o mapa de **Taps (mobile)** da `/v2`, 01–13/08:

- **770 page views** e **394 cliques** no período (só mobile).
- A lista traz os **73 elementos mais clicados**, somando **274 taps** (o resto são cliques dispersos fora do top).

Ele não traz profundidade de rolagem nem gravações — só onde as pessoas tocam. Mas isso já responde a pergunta.

## Leitura dos dados

Taps por região da página:

| Região | Taps | % dos taps mapeados |
| --- | --- | --- |
| Hero (topo, 1ª tela) | 131 | 47,8% |
| FAQ | 53 | 19,3% |
| Header / footer / seções soltas | 39 | 14,2% |
| Acordeões (radix) | 21 | 7,7% |
| Como funciona | 13 | 4,7% |
| Preços | 12 | 4,4% |
| Recursos | 3 | 1,1% |
| Depoimentos | 2 | 0,7% |

Só os CTAs (botões que levam ao checkout):

| CTA | Taps |
| --- | --- |
| Hero "Começar por R$ 6,90" | **74** |
| CTA final | 6 |
| Preços | 5 |
| Depois da demo | 5 |
| Recursos | 1 |

## Conclusão

- **~81% de todos os cliques em CTA acontecem no hero**, antes de qualquer rolagem. A decisão é tomada na primeira tela.
- A página inteira abaixo do hero contribui com **17 cliques em CTA em 13 dias**. Preços, depoimentos e recursos são praticamente inertes (2 a 5 taps cada).
- Existe um segundo grupo real, minoritário e de alta intenção: **FAQ com 53 taps** (19%) — as 5 perguntas abertas repetidamente. Quem rola, rola para tirar dúvida/objeção, não para ler benefícios.
- Cruzando com o banco: 250 pessoas distintas chegaram no `/v2/checkout` em agosto contra 770 page views mobile na landing. O gargalo não é a landing — é o checkout (2 pagamentos no cartão em agosto, já medido antes).

Ou seja: a landing longa está sendo **pulada**, não lida. Quem converte decide no hero; quem hesita vai direto ao FAQ.

## O que eu faria com isso (aguardando sua escolha)

1. **Encurtar o caminho**: puxar 2–3 objeções do FAQ (as 3 mais tocadas) para logo abaixo do hero, e mover o FAQ para mais alto na página.
2. **Segundo CTA precoce**: hoje o próximo CTA depois do hero só aparece após a demo. Colocar um CTA imediatamente após o bloco de objeções.
3. **Manter o instrumento novo rodando**: a medição de rolagem que acabamos de instalar (`landing_scroll_25/50/75/100` + `?src=`) confirma isso com número próprio em 3–5 dias, e passa a medir também desktop, que o Clarity Tap não cobre.
4. **Não investir em Preços/Depoimentos/Recursos** — 5, 2 e 3 taps em 13 dias não justificam trabalho de copy ali.

Posso executar 1 + 2 agora, ou esperar os 3–5 dias do instrumento próprio antes de mexer no layout.
