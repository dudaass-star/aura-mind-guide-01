# Landing V2 — deixar o lead encantado (e converter mais)

A V2 já está boa em estrutura. O que falta é: (1) corrigir preços legados que hoje enfraquecem a oferta, (2) mostrar a AURA em ação mais cedo, (3) trocar copy defensiva por promessa de relação contínua — a mesma linguagem que passou a funcionar no checkout.

## 1. Corrigir a oferta (maior ganho, menor esforço)

Hoje o bloco de preços diz "Após 7 dias, R$ 29,90/mês ou R$ 299/ano" e os cards mostram só o mensal (29,90 / 49,90 / 79,90). A grade nova (Essencial anual 9,90/mês, Direção 16,90, Transformação 26,90) não aparece em nenhum lugar — o lead vê o preço mais caro possível.

- Puxar valores de `src/lib/plan-pricing.ts` em `PricingV2.tsx` (fim dos números hardcoded).
- Toggle de ciclo (Mensal / Trimestral / Semestral / Anual) igual ao checkout, com selo de desconto (-33% / -50% / -67%) e "Anual" pré-selecionado ou destacado.
- Cada card mostra equivalente mensal + total cobrado, e o CTA leva o ciclo escolhido para `/v2/checkout` via `state`.
- Trocar "R$ 299/ano" pelo valor real e usar o gancho novo: **menos de R$ 0,33 por dia** no anual (hoje a seção escura diz "menos de R$ 1,00 por dia").

## 2. Hero mais magnético

- Subheadline ganha prova concreta em vez de descrição genérica: memória do histórico + sessões guiadas + 24/7.
- Um selo de prova social acima ou abaixo do CTA ("+5.000 pessoas já começaram" — já usado na landing v1).
- Microcopy do CTA reforçando risco zero: "7 dias por R$ 6,90 · cancela em 1 clique · reembolso em 7 dias".

## 3. Demo mais cedo e mais viva

O `DemoV2` está depois do "Como funciona". O lead precisa *sentir* a conversa antes de ler explicação.

- Subir a demo para logo depois do hero (ou um teaser curto de 3 bolhas no hero, com a conversa completa mantida na seção).
- Incluir um trecho que mostre memória em ação ("na semana passada você falou que…") — é o diferencial que a copy do checkout provou vender bem.

## 4. Copy: de features para transformação

- `BenefitsGridV2`: manter os 12 itens, mas reescrever os 4 primeiros em linguagem de benefício sentido, não de recurso.
- `FAQV2`: aplicar o mesmo tratamento do checkout — abrir com "O que muda em ter a AURA no seu WhatsApp?" (relação contínua) antes das perguntas defensivas.
- `TestimonialsV2`: destacar um depoimento como citação grande (peso editorial) em vez de três cards iguais.
- `FinalCTAV2`: fechar com a comparação de custo (uma sessão de terapia vs. um mês de AURA) + garantia de reembolso.

## 5. Detalhes técnicos

- Arquivos tocados: `src/components/v2/PricingV2.tsx`, `HeroV2.tsx`, `BenefitsGridV2.tsx`, `FAQV2.tsx`, `TestimonialsV2.tsx`, `FinalCTAV2.tsx`, `StickyMobileCTAV2.tsx`, `src/pages/IndexV2.tsx` (ordem das seções), `src/styles/v2-theme.css` se precisar de token novo.
- Sem mudança de backend, preços ou Stripe/Asaas: só leitura de `plan-pricing.ts` e navegação com `state`.
- `trackCtaClick` mantido em todos os CTAs, com rótulo do ciclo escolhido para dar visibilidade de qual ciclo converte.
- Validação: abrir `/v2` no preview (mobile e desktop) e confirmar preços novos, ordem das seções e CTAs levando o ciclo correto ao checkout.

## Fora de escopo

- Alterar preços reais ou criar SKUs.
- Tocar na landing v1 (`/`) ou no checkout.