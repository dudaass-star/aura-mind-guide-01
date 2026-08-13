# Funil de checkout — agosto/2026: números reais e gargalos

## 1. Quem clicou em pagar (01–13/08, BRT)

Importante: a instrumentação do funil só existe a partir de **06/08**, então a base de "abriu o checkout" cobre 06–13/08. As sessões de checkout (`checkout_sessions`) cobrem o mês inteiro.

| Etapa | Cartão | PIX |
|---|---|---|
| Abriu a página do checkout (245 sessões, sem separar método) | — | — |
| Preencheu nome/e-mail/telefone e enviou | 29 sessões | — |
| Formulário do Stripe realmente carregou | 29 sessões | — |
| Abriu a janela do PIX | — | 11 sessões |
| QR gerado com sucesso | — | 8 sessões |
| Copiou o código PIX | — | 2 sessões |
| **Pessoas distintas que chegaram a iniciar pagamento** | **47** | **14** |

## 2. Quem efetivamente pagou

| Método | Iniciaram | Pagaram | Taxa |
|---|---|---|---|
| Cartão (Stripe) | 47 pessoas | 2 | 4,3% |
| PIX Automático | 14 (12 reais + 2 testes) | 4 (2 reais + 2 testes) | 17% sobre os reais |

Pagantes reais do mês: Eduardo (02/08, cartão), Valéria (07/08, cartão), Cris Silveiira (12/08, PIX Woovi R$ 6,90) e Paula Cristina (12/08, PIX Woovi R$ 9,90).

**Correção de leitura importante:** dos 4 PIX pagos, só **2 são seus testes** (`pixauto.teste.inter@` e `pixauto.teste2.inter@`, trilho Inter, 11/08). Os outros dois, de 12/08, são clientes reais no trilho **Woovi**, ativos até 12/09. Ou seja: **o PIX Woovi já vendeu 2 assinaturas reais no primeiro dia no ar** — e são as duas únicas vendas dos últimos 5 dias.

## 3. Gargalos identificados (por tamanho de perda)

**G1 — 245 abriram o checkout, 40 tentaram pagar (84% saem antes de qualquer tentativa).**
Dessas 245 sessões, **227 abriram no plano Direção** (R$ 29,90/mês como primeiro preço visto) contra 17 no Essencial. O padrão foi trocado para Essencial só ontem, então o mês inteiro rodou com a entrada mais cara na frente. É a maior perda do funil e a hipótese mais forte de causa.

**G2 — PIX ficou indisponível na maior parte do mês.**
46 sessões em 11/08 receberam "PIX indisponível" (trilho Asaas com 401) e 07/08 teve 4 erros de geração de QR. O PIX só passou a funcionar de fato em 12/08 — e nesses dois dias converteu 4x melhor que o cartão. Todo o mês anterior a isso empurrou 100% do tráfego para o método que menos converte.

**G3 — Cartão: 27 pessoas abriram o formulário do Stripe e não pagaram, e não sabemos por quê.**
O clique real em "pagar" acontece dentro do iframe do Stripe e nunca foi registrado; o evento `card_declined` só entrou em produção ontem. Não é possível hoje separar "desistiu ao ver o cartão" de "o banco recusou". Este é um ponto cego de medição, não um número ruim comprovado.

**G4 — 23 cliques em pagar com o formulário completamente vazio.**
`form_invalid` com `phone,name,email` ausentes. São pessoas clicando no botão antes de preencher e provavelmente não entendendo o que travou (sem erro visível por campo nem foco automático no primeiro campo inválido).

**G5 — Métrica de "checkout iniciado" infla o denominador.**
`checkout_sessions` grava 63 linhas de cartão para 47 pessoas distintas (retentativas + prewarm). Qualquer taxa calculada sobre linhas fica pessimista; o correto é contar pessoas.

## 4. O que propor fazer (em ordem)

1. **Fechar o ponto cego do cartão (G3):** registrar no funil o início real do pagamento (evento do Stripe Elements ao submeter o cartão) e o tempo de permanência no formulário, além do `card_declined` já ativo. Sem isso não há como saber se o problema é preço, confiança ou recusa bancária.
2. **Corrigir a UX do formulário (G4):** validar campo a campo com mensagem inline, foco automático no primeiro campo vazio e botão em estado desabilitado explicativo até o mínimo estar preenchido.
3. **Painel de funil por método (G1/G5):** um bloco no Admin com o funil correto — pessoas distintas, separado em cartão e PIX, com plano visto na entrada — para acompanhar o efeito das mudanças de ontem (Essencial padrão + PIX pré-selecionado) sem consultar o banco na mão.
4. **Marcar sessões de teste (higiene):** flag `is_test` em `checkout_sessions`/`profiles` para e-mails `@olaaura.com.br`, excluindo-as automaticamente de todas as métricas.
5. **Não concluir nada sobre conversão antes de 3–5 dias** com PIX Woovi ativo e Essencial como padrão: a base de agosto está contaminada por trilho fora do ar e pelo plano caro na frente.

## Detalhes técnicos

- Fonte dos números: `checkout_funnel_events` (steps `page_view`, `form_submit`, `embedded_mounted`, `pix_modal_open`, `pix_qr_generated`, `pix_copy`, `form_invalid`, `pix_rail_down`) e `checkout_sessions` (`status='completed'`), cruzados com `profiles.card_gateway` e `woovi_charges`.
- Item 1: novo step `card_pay_click` em `src/lib/checkout-funnel.ts`, disparado no `onSubmit` do `PaymentElement` em `CheckoutV2.tsx`; `card_declined` já é gravado pelo `stripe-webhook`.
- Item 3: consultas agregadas por `anon_session_id` distinto em `AdminEngagement.tsx`, com corte por `payment_method` e por `plan` do `page_view`.
- Item 4: migração adicionando `is_test boolean not null default false` com GRANTs, backfill por padrão de e-mail, e filtro nas consultas do admin.
