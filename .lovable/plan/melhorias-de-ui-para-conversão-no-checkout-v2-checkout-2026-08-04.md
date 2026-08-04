# Melhorias de UI para conversão no checkout (/v2/checkout)

Auditoria feita com captura real da página em desktop (1280) e mobile (390). O fluxo já está bom no essencial (2 passos, erros inline, selo de garantia), mas há atritos claros de leitura de preço e de layout.

## Problemas observados

1. **Abas de ciclo sem preço.** Trim/Sem/Anual mostram só "-32% / -50% / -66%". O usuário precisa clicar para descobrir o valor — o desconto grande (que é o argumento mais forte) não vira número visível.
2. **Dois preços concorrentes no CTA.** O botão de cartão diz "Começar trial por R$ 9,90" e o de PIX diz "PIX Automático — R$ 49,90/mês". Lado a lado, parece que o PIX custa 5x mais. Isso mata a escolha do PIX (que é justamente o meio com melhor retenção).
3. **Desktop com ~60% da tela vazia.** Coluna única centrada, sem painel de resumo/valor à direita. Nada de prova social acima da dobra além de uma frase pequena no fim.
4. **Cards de plano em ordem crescente com "Direção" no meio.** O plano recomendado não domina visualmente (mesma altura, mesmo peso dos vizinhos).
5. **Prova social e garantia só no rodapé**, abaixo do CTA — quem decide antes de rolar não vê.
6. **Formulário antes do CTA sem microcompromisso.** Três campos sem indicação de progresso do passo 1 → 2 além do stepper no topo.

## O que fazer

### 1. Abas de ciclo com valor por mês e economia em reais
Cada aba mostra o preço/mês do plano selecionado e o total cobrado. Ex.: `Anual · R$ 16,90/mês · R$ 202,80 à vista · economize R$ 396`. Selo "-66%" continua como reforço, não como única informação.

### 2. Unificar a narrativa de preço dos dois botões
- Cartão: `Começar por R$ 9,90 (7 dias)`
- PIX: `Pagar com PIX — R$ 9,90 hoje` quando houver equivalência, ou rótulo explícito `PIX Automático · sem trial · R$ 49,90/mês` com uma linha comparativa acima dos dois botões explicando a diferença em uma frase.
Objetivo: nenhum usuário conclui que PIX é mais caro sem contexto.

### 3. Layout desktop em duas colunas
Esquerda: seleção de plano + formulário + CTA. Direita (sticky): resumo do pedido (plano, ciclo, cobrado hoje, próxima cobrança), 3 bullets de valor, garantia de 7 dias, 2 depoimentos curtos com nota 4.9/5. Mobile mantém coluna única, com o resumo colapsado acima do CTA.

### 4. Destaque real do plano recomendado
Card "Direção" com borda mais forte, leve escala, fundo diferenciado e uma linha de razão ("melhor custo por sessão"). Adicionar comparativo de custo por sessão em cada card.

### 5. Trust acima da dobra
Mover garantia/cancelamento/segurança para logo abaixo do seletor de plano (linha compacta de ícones) e manter a versão completa no rodapé.

### 6. CTA fixo no mobile
Barra inferior sticky com "cobrado hoje" + botão principal, aparecendo quando o CTA original sai da viewport.

### 7. Microcopy de redução de risco no formulário
- WhatsApp: "É por aqui que a AURA fala com você. Não enviamos spam."
- Email: "Só para recibo e recuperação de acesso."
- Botão em loading com texto de estado ("Abrindo pagamento seguro...").

## Detalhes técnicos

- Todas as mudanças ficam em `src/pages/CheckoutV2.tsx` (apresentação) + leitura de `src/lib/plan-pricing.ts` para derivar preço/mês, total do ciclo e economia em R$ (sem novos preços, sem tocar em edge functions).
- Extrair componentes de apresentação para `src/components/checkout/`: `CycleTabs.tsx`, `PlanCard.tsx`, `OrderSummary.tsx`, `TrustRow.tsx`, `StickyMobileCta.tsx` — mantendo o estado e os handlers de pagamento onde já estão.
- Cores/sombras via tokens semânticos existentes; nada de classes de cor cruas.
- Sem alteração de gateway, tags Meta Pixel/CAPI, ou lógica de trial/returning-customer.

## Fora de escopo
Mudança de preços, novos ciclos, testes A/B com backend, alteração de fluxo de pagamento.
