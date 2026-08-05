# Checkout /v2/checkout — refinamento visual para conversão

Auditoria feita com captura real em desktop (1280) e mobile (390) do estado atual. A estrutura já está boa (2 passos, resumo sticky, prova social, trust row, ciclos com preço). O que sobrou são problemas de **contraste, peso visual e formato** — não de conteúdo. Cinco pontos com impacto real, o resto está adequado.

## 1. O botão principal não parece clicável (maior perda)
O CTA sage sobre fundo navy fica com contraste baixo e o texto sai acinzentado. É o elemento mais importante da página e hoje tem menos presença visual que o card "Direção".

- Verde do CTA mais saturado/claro, texto em peso 600 e tamanho maior.
- Altura maior (h-14), sombra/glow sutil na cor do CTA, seta à direita.
- Estado hover/active com deslocamento leve para dar sensação de botão físico.

## 2. Cartão vs PIX: dois botões concorrendo
Hoje são dois botões empilhados (um cheio, um contornado). O contornado lê como "opção secundária" — mas PIX é meio dominante no Brasil, e o PIX ainda carrega preço diferente no rótulo.

Trocar por **seletor de método** (dois chips/tabs "Cartão" | "PIX Automático") acima de **um único CTA**. O valor cobrado hoje aparece uma vez só, abaixo do seletor, mudando conforme o método. Elimina de vez a leitura "PIX é mais caro" e dobra o peso visual do CTA único.

## 3. Números pouco legíveis / paleta de descontos brigando
- Preços em serif (Fraunces) em tamanho pequeno: aplicar `tabular-nums` e subir um passo de tamanho nos valores principais; usar sans nos valores secundários ("depois R$ 49,90/mês") para separar hierarquia.
- Selos `-32% / -50% / -66%` em âmbar competem com o sage do estado selecionado. Padronizar economia em **um** tom de destaque (âmbar suave só para economia, sage só para seleção) e não usar os dois no mesmo chip.
- Abas de ciclo no mobile: 4 colunas com texto de 10px. Virar grid 2x2 com alvos de toque maiores.

## 4. Metade da tela vazia abaixo do CTA (desktop)
Depois do trust row sobram ~500px de vazio. Preencher com um bloco compacto de **3 objeções** ("Vou falar com um robô?", "Como cancelo?", "Meus dados ficam seguros?") em acordeão fechado + linha final de segurança. Objeção respondida na hora do clique é conversão; página que termina no vazio parece incompleta.

## 5. Formulário com pouco contraste
Bordas `white/15` e placeholders muito apagados dificultam entender que os campos são editáveis.

- Bordas e placeholders mais visíveis, altura h-12 no mobile, foco com anel sage nítido.
- Stepper do topo (hoje cinza e discreto) virar barra de progresso fina com rótulo — reforça que falta pouco.

## Detalhes técnicos
- Tokens: criar escopo `.checkout-dark` em `src/styles/` com as variáveis do fundo navy, sage do CTA, âmbar de economia e tons de texto, substituindo os `text-white` e `bg-[hsl(...)]` crus em `CheckoutV2.tsx`, `OrderSummary.tsx`, `CycleTabs.tsx`, `TrustRow.tsx`, `StickyMobileCta.tsx`.
- Variante nova de botão (`sage-solid` / tamanho `cta`) em `src/components/ui/button.tsx`.
- Novos componentes de apresentação: `PaymentMethodToggle.tsx` e `CheckoutObjections.tsx` em `src/components/checkout/`.
- Sem mudança de preços, gateways, handlers de pagamento, Meta Pixel/CAPI ou lógica de trial/returning-customer. Tudo apresentação.

## Fora de escopo
Mudar preços, ciclos, fluxo de pagamento ou teste A/B com backend.
