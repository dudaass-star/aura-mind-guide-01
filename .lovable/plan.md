# Análise completa: landing /v2 + checkout (Clarity, 01–13/08)

## Parte 1 — Landing /v2 (taps mobile)

770 page views, 394 cliques. Os 73 elementos mais tocados somam 274 taps.

Por região:

| Região | Taps | % |
| --- | --- | --- |
| Hero (1ª tela) | 131 | 47,8% |
| FAQ | 53 | 19,3% |
| Header/footer/soltos | 39 | 14,2% |
| Acordeões | 21 | 7,7% |
| Como funciona | 13 | 4,7% |
| Preços | 12 | 4,4% |
| Recursos | 3 | 1,1% |
| Depoimentos | 2 | 0,7% |

Só CTAs: hero **74**, CTA final 6, preços 5, pós-demo 5, recursos 1.

**≈81% dos cliques em CTA saem do hero, antes de rolar.** Toda a página abaixo do hero gerou 17 cliques em CTA em 13 dias. Quem rola, rola pro FAQ (objeção), não pra ler benefícios.

## Parte 2 — Checkout /v2/checkout (cliques desktop)

26 page views, 104 cliques. Mapeando pelos IDs reais do código:

| Ação | Cliques |
| --- | --- |
| Troca de plano (`#essencial` 6, `#direcao` 6, `#transformacao` 3) | 15 |
| Troca de ciclo (abas Mensal/Trim/Anual) | 12 |
| Clique no telefone (`#phone`) | 2 |
| Clique no e-mail (`#email`) | 1 |
| Clique no nome (`#name`) | 0 |
| Clique no CPF (`#cpf`) | 0 |
| **Clique no botão de pagar (`#checkout-primary-cta`)** | **0** |

O resto são cliques em áreas vazias do card.

### O que isso significa

No desktop, em 13 dias: **ninguém apertou o botão de pagar. Nem uma vez.** E praticamente ninguém tocou nos campos — 3 cliques em campo contra 27 trocas de plano/ciclo.

O comportamento é inequívoco: a pessoa chega no checkout e **fica comparando preço**. Troca plano, troca ciclo, troca plano de novo — em média mais de uma troca por visitante — e sai sem começar a preencher. Não é abandono por atrito de formulário (formulário nem foi tocado). É **decisão de preço travada na comparação**.

Isso fecha o quadro do funil de agosto que já tínhamos medido: 47 formulários iniciados / 2 pagamentos no cartão. O desktop não contribui com nada; tudo que existe de conversão vem do mobile.

## Conclusão conjunta

1. A landing longa está sendo **pulada**, não lida. A decisão acontece no hero.
2. Quem chega no checkout **não trava no formulário, trava na grade de preços**. Dar 3 planos × 4 ciclos = 12 combinações para um lead que ainda não confia é excesso de escolha na hora errada.
3. Preços/Depoimentos/Recursos na landing são inertes (2–5 taps em 13 dias) — não vale copy ali.

## O que eu proponho fazer

**A. Simplificar a decisão no checkout (prioridade 1)**
- Chegar com **um plano e um ciclo já escolhidos** (Essencial mensal, R$ 6,90 na 1ª semana) e o formulário visível de imediato.
- Esconder a grade completa atrás de um link discreto ("ver outros planos e ciclos"), em vez de mostrar 12 combinações de cara.
- Objetivo direto: fazer o lead começar a preencher antes de comparar.

**B. Encurtar o caminho na landing (prioridade 2)**
- Subir as 3 objeções mais tocadas do FAQ para logo abaixo do hero, com um CTA imediatamente depois (hoje o próximo CTA só aparece depois da demo).

**C. Medir**
- A instrumentação nova (`landing_scroll_*` + `?src=`) confirma A e B com número próprio em 3–5 dias e cobre desktop, que o Clarity Tap não pega.

Se aprovar, começo por **A** — é onde está o buraco de 0 cliques no botão de pagar.
