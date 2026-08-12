# Corrigir a janela "Pagar com PIX": CPF invisível e valor errado

## O que está errado (confirmado no código)

1. **Números do CPF invisíveis.** O campo usa a classe de tema `ck-field`, mas o estilo dela só se aplica dentro do container `.checkout-dark`. O modal é renderizado por portal, fora desse container, então nada do tema pega: o campo cai no estilo padrão (fundo claro) enquanto o texto herda a cor branca do modal — branco no branco.

2. **Valor errado no mensal.** O cabeçalho e o botão do modal estão fixos em "R$ 29,90 à vista", sem olhar o modo do PIX. No mensal o fluxo é PIX Automático com entrada promocional (R$ 6,90 Essencial / 9,90 Direção / 19,90 Transformação) + mensalidade cheia depois — exatamente o que o botão do checkout já anuncia. Só a tela do QR mostra o valor real; a tela de CPF ficou desalinhada.

Por que não foi ajustado antes: os ajustes recentes de valores foram feitos na página do checkout e na tela do QR; esta tela intermediária (formulário de CPF) ficou com a copy antiga de "à vista", que só é correta para Trimestral/Semestral/Anual.

## Correção

**1. Legibilidade do campo CPF**
Aplicar cores explícitas no input do modal (fundo escuro do modal, texto claro legível, placeholder atenuado), sem depender do escopo `.checkout-dark`. Mesmo tratamento para o campo em qualquer outro modal do checkout que use `ck-field`.

**2. Valor coerente com o plano e o ciclo**
No formulário de CPF:
- **Mensal (PIX Automático):** "1ª semana R$ 6,90 • depois R$ 29,90/mês" (valores conforme o plano), e botão "Gerar PIX — R$ 6,90".
- **Trimestral/Semestral/Anual (à vista):** mantém "R$ X à vista" e "Gerar PIX — R$ X".
- **Inter em modo 7 dias grátis:** "7 dias grátis • depois R$ X/mês" e botão "Gerar PIX de autorização".
- Cliente retornante (sem direito à promo) só é identificado pelo backend; a tela do QR já mostra o valor real cobrado, então a promo aqui é anunciada com a mesma regra já usada no botão principal da página.

**3. Conferência visual**
Abrir o modal em Mensal e em Anual, conferir CPF legível (digitando) e valores corretos nas duas variações.

## Detalhes técnicos
- `src/pages/CheckoutV2.tsx`, bloco `pixStage === "form"` (linhas ~1805-1856): trocar a copy fixa por derivação de `pixMode`, `billingPeriod`, `currentPlan.trialPrice`, `currentPrice` e `interTrialMode`; classe do `Input` com `bg-white/5 text-white placeholder:text-white/40 border-white/15` em vez de depender de `ck-field`.
- Nenhuma mudança de backend, de valor cobrado ou de lógica de gateway — apenas apresentação.
