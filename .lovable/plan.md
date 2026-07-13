## Como fica o checkout quando `card_gateway = asaas`

O `/v2` continua o mesmo até o passo "Forma de pagamento". A diferença só aparece **depois** que o usuário escolhe Cartão e clica em pagar: em vez do embed do Stripe (Payment Element com Apple Pay, campos Stripe hospedados, etc.), o `CheckoutV2` monta o componente nativo `AsaasCardForm` no lugar do painel do Stripe.

### O que muda visualmente vs. a tela que você mandou


| Item                         | Stripe (hoje na screenshot)                                          | Asaas                                                                                                                                                         |
| ---------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Botão Apple Pay / Google Pay | Aparece no topo do Payment Element                                   | **Não existe** — Asaas não tem wallets                                                                                                                        |
| Divisor "OU"                 | Sim                                                                  | Não                                                                                                                                                           |
| Campo E-mail                 | Dentro do Payment Element Stripe                                     | Já veio do passo anterior, não repete                                                                                                                         |
| Dados do cartão              | Iframe Stripe (número + MM/AA + CVC juntos, com bandeira automática) | 3 inputs próprios nossos: **Número do cartão**, **Validade (MM/AA)**, **CVV** — visual do nosso design system (`bg-white/5`, borda sage no focus)             |
| Nome do titular              | Campo Stripe                                                         | Input próprio, força UPPERCASE                                                                                                                                |
| País/Região + CEP            | Stripe pede país + CEP automaticamente                               | Pedimos **CPF do titular** (com máscara `000.000.000-00`), **CEP** (`00000-000`) e **Número do endereço**                                                     |
| Parcelamento                 | Stripe não parcela                                                   | Se o ciclo for **Trimestral/Semestral/Anual** aparece um seletor "À vista recorrente / Parcelar" e, quando Parcelar, um dropdown "2x…12x" (mensal não mostra) |
| Botão de pagar               | "Pagar R$ 9,90" padrão Stripe                                        | Botão sage cheio "Pagar R$ …" com ícone de cartão + rodapé "Pagamento seguro processado pelo Asaas" (troca o "processado pelo Stripe")                        |
| Link "Editar dados"          | Não tem                                                              | Aparece no topo com seta ← pra voltar pro passo 1                                                                                                             |
| Cabeçalho da barra preta     | "🔒 Pagamento seguro Stripe · Garantia 7 dias · Cancele em 1 clique" | Continua igual — esse header é fixo do `CheckoutV2` e **não** troca o texto pra Asaas hoje (ponto de atenção, veja abaixo)                                    |


### Estados pós-submit

- **Aprovado na hora** → toast "Pagamento aprovado!" e redireciona pro sucesso (igual Stripe).
- `**AWAITING_RISK_ANALYSIS**` (análise antifraude do Asaas) → o form **substitui a tela** por um card intermediário "Pagamento em análise" explicando que costuma levar poucos minutos, que o usuário vai receber WhatsApp em `{telefone}` e email em `{email}`, com CTA "Acompanhar no meu espaço". Isso não existe no fluxo Stripe.
- **Erro** → toast vermelho com a mensagem do Asaas (ex.: cartão recusado, CPF inválido).

### Pontos que hoje **ficam iguais** e você pode querer ajustar

1. O header preto continua dizendo "Pagamento seguro **Stripe**" mesmo quando o gateway é Asaas.
2. O resumo do plano no topo (verde sage com "AURA — 7 dias Direção · R$ 9,90…") **não muda** — só que o plano semanal (`R$ 9,90 → 49,90/mês`) **não é oferecido em Asaas** porque semanal só existe no Stripe. Ou seja, essa tela específica que você mandou nunca vai aparecer com Asaas; no Asaas o topo mostra Essencial/Direção/Transformação em Mensal/Trim/Sem/Anual.
3. Não tem Apple Pay/Google Pay nem Link — se performance de checkout mobile importa, é um trade-off real do Asaas.

### Screenshot real

Pra te mandar a captura de fato eu precisaria alternar temporariamente o `system_config.card_gateway` pra `asaas` (é uma escrita no banco) e rodar o Playwright no `/v2`. Como estou em plan mode e isso mexe em config viva de produção, prefiro te confirmar antes:

**Posso alternar `card_gateway` pra `asaas` por ~1 min só pra capturar o screenshot e voltar pra `stripe` em seguida?** Ou você prefere que eu monte um preview isolado (rota temporária tipo `/v2?force_gateway=asaas`) que não afeta usuários reais? sim