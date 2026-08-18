# Onde o CAC de R$ 50 vaza de verdade: o meio do checkout

## Premissa aceita
Otimizar por InitiateCheckout já foi testado por meses e piorou o CAC (R$ 100+ contra R$ 50 de hoje). Nada no plano mexe no evento otimizado da campanha nem na estrutura de eventos enviados ao Meta.

## O que os dados dos últimos dias mostram

| Dia | Chegadas de anúncio | Clique no CTA | Modal PIX aberto | Compras |
|---|---|---|---|---|
| 15/08 | 60 | 23 | ~10 | 0-1 |
| 16/08 | 108 | 33 | 17 | 8 |
| 17/08 | 67 | 20 | 7 | 3 |

Duas leituras diretas:
- Com 4,5%–7,4% de compra sobre visita de anúncio nos dias bons, a landing não é o gargalo. Página que converte assim não é o motivo de um CAC alto.
- A perda concentrada está entre "clicou no CTA" e "gerou o PIX / enviou o cartão". Em 16/08 houve 19 toques em pagar com formulário vazio (`cta_empty_form`), e no cartão apenas 3 envios contra 4 recusas.

Por isso o plano ataca o meio do checkout, não o topo.

## Bloco 1 — Matar o `cta_empty_form` (maior volume de perda)
Hoje o toque no botão fixo com formulário vazio rola a página e foca o primeiro campo, mas continua sendo o evento mais frequente do dia. Mudanças:
- Botão fixo passa a mostrar rótulo de progresso ("Preencha seus dados" quando vazio, "Pagar com PIX" quando completo), em vez de sempre prometer pagamento.
- Foco automático no primeiro campo vazio com destaque visual curto, e mensagem inline por campo em vez de erro genérico.
- Registrar quais campos estavam vazios no momento do toque, para saber se a desistência é no CPF, no telefone ou no e-mail.

## Bloco 2 — Reduzir o abandono no preenchimento
- Persistir o que já foi digitado (nome/e-mail/telefone/CPF) na sessão, para quem sai e volta não recomeçar.
- Máscara e validação de CPF/telefone em tempo real, com teclado numérico no mobile.
- País padrão correto no telefone (hoje o componente pode abrir em outro país), eliminando telefone inválido silencioso.
- Ordem dos campos enxuta: só o mínimo antes de gerar o PIX; o restante depois da confirmação quando não for obrigatório.

## Bloco 3 — Cartão recusado com saída
Há mais recusas do que envios bem-sucedidos. Quando o cartão é recusado:
- Mensagem específica por motivo (saldo, dados, banco) em vez de "erro no pagamento".
- Oferta imediata de PIX na mesma tela, com o QR já gerado, sem refazer o formulário.
- Registrar `card_declined_reason` no funil para dimensionar quanto disso é recuperável.

## Bloco 4 — Painel
No painel de funil do admin, adicionar por dia: taxa CTA→PIX gerado, taxa CTA→cartão enviado, campos mais deixados em branco no `cta_empty_form` e motivos de recusa do cartão. É como vamos medir se cada bloco funcionou.

## O que fica de fora
- Nenhuma mudança de preço, plano padrão, método padrão (PIX segue padrão) ou regra de trial.
- Nenhuma alteração no evento otimizado da campanha nem nos eventos de Purchase/Subscribe.
- Suavizar o vocabulário clínico da landing fica como teste futuro, não como correção: não há evidência de penalidade de leilão, e CTR de 2,34% contradiz essa hipótese.

## Verificação da tese do leilão (sem código)
O único lugar onde a hipótese de "categoria sensível encarecendo o leilão" se confirmaria é um aviso de domínio no Gerenciador de Eventos para olaaura.com.br. Se esse aviso existir, isso vira prioridade e eu remonto o plano; sem ele, a explicação mais provável do CPM de R$ 74 é público estreito / criativos competindo entre si.

## Detalhes técnicos
- `src/pages/CheckoutV2.tsx`: rótulo dinâmico do CTA, foco no primeiro campo vazio, persistência em sessionStorage, máscaras e validação inline, fallback PIX pós-recusa.
- `src/components/checkout/StickyMobileCta.tsx`: estado do botão conforme completude do formulário.
- `src/lib/checkout-funnel.ts`: campos vazios no `cta_empty_form` e `card_declined_reason`.
- `src/components/admin/CheckoutFunnelPanel.tsx`: novas taxas e quebras por campo/motivo.
- Sem migração de banco: tudo cabe no `meta` de `checkout_funnel_events`.
