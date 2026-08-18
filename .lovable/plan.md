# Landing V3 — versão "bem-estar" para outro conjunto de anúncios

Objetivo: uma landing nova em `/v3`, isolada da `/v2`, com vocabulário 100% livre de termos clínicos/saúde e construída para alta conversão. Serve para rodar em conjunto de anúncio separado e comparar resultado com a `/v2` (que continua intacta).

## Posicionamento
A AURA como **companhia inteligente no WhatsApp para organizar a cabeça** — clareza, foco, decisões, rotina. Nada de saúde, nada de comparação com atendimento profissional, nada de preço comparado a consulta.

## Dicionário de linguagem (obrigatório em toda a V3)

| Fora | Entra |
|---|---|
| acompanhamento emocional | emocional / apoio no dia a dia |
| ansiedade, depressão, cura, terapia, psicólogo, psicologia | (removidos, sem substituto) |
| "custa menos que uma consulta" | "menos que um café por dia" |
| sessão / sessões | **encontro guiado** (45 min) |
| crise | momento difícil / hora apertada |
| paciente, tratamento, diagnóstico | você, seu percurso |
| "acolhimento clínico" | "conversa que entende seu contexto" |

Palavras-chave da V3: clareza, foco, direção, organizar os pensamentos, rotina, decisões, percurso, memória, presença.

Um teste automatizado de vocabulário (lista de termos proibidos) roda contra todo o texto dos componentes V3 para garantir que nada escape agora nem em edições futuras.

## Estrutura da página (ordem pensada para conversão)

1. **Header** — logo + "Preços" + CTA.
2. **Hero** — headline "Sua cabeça mais organizada, todo dia." Subtítulo: companhia no WhatsApp que lembra da sua história, ajuda a pensar melhor e está disponível a qualquer hora. CTA R$ 6,90 + prova social (+5.000 pessoas) + 3 selos (4.9/5, 24/7, memória de longo prazo). Foto reaproveitada da V2 ou nova imagem neutra (celular/rotina) gerada para a V3.
3. **Demo de conversa** — reaproveita a mecânica animada da V2, mas com **diálogo novo**: pessoa travada numa decisão de carreira/rotina, sem vocabulário emocional-clínico. Mostra memória de longo prazo e áudio.
4. **Como funciona** — 3 passos: manda mensagem no WhatsApp → a AURA lembra do seu contexto → você sai com um próximo passo claro.
5. **O que você ganha** — grid de 6 benefícios: disponível 24/7, memória de longo prazo, encontros guiados de 45 min, áudio nos dois sentidos, resumo escrito, conteúdo sob medida.
6. **Depoimentos** — reescritos em torno de clareza/decisão/rotina (sem menção a sintoma ou tratamento).
7. **Preços** — mesma grade e mesmos ciclos da V2 (Essencial default, Direção "Recomendado"), com "encontros guiados" no lugar de "sessões". Bloco de garantia: 7 dias por R$ 6,90, reembolso em 7 dias, cancela em 1 clique.
8. **FAQ** — reescrito: sem a pergunta de comparação com atendimento profissional e sem a de "por que é mais barato que terapia". Entram: como funciona o teste de 7 dias, posso pausar, posso mandar áudio, meus dados estão seguros, o que são os encontros guiados, posso cancelar quando quiser. JSON-LD de FAQ atualizado para o texto novo.
9. **CTA final** + **Footer** + **CTA fixo no mobile**.

## Medição (separar V3 de V2 no relatório)

- Todos os CTAs apontam para `/v2/checkout?src=<posição>&lp=v3` — mesmo checkout, origem marcada.
- Os eventos de funil e de engajamento (rolagem 25/50/75/100, tempo, saída, clique de CTA) ganham `lp: "v3"` no `meta`, então o painel de engajamento consegue comparar V2 x V3 lado a lado.
- Meta Pixel/CAPI: `ViewContent` com `content_name: "Landing V3"` e `content_category: "homepage_v3"`, mantendo a deduplicação atual.
- `noindex, nofollow` e canonical próprio, igual à V2 — é página de anúncio, não de busca.

## Detalhes técnicos

- Nova rota `/v3` em `src/App.tsx` apontando para `src/pages/IndexV3.tsx`. A raiz `/` continua redirecionando para `/v2` — nada muda no tráfego atual.
- Novos componentes em `src/components/v3/` (Header, Hero, Demo, HowItWorks, Benefits, Testimonials, Pricing, FAQ, FinalCTA, Footer, StickyMobileCTA), derivados dos da V2 para não mexer em nenhum arquivo `v2`.
- `src/lib/landing-analytics.ts` ganha um parâmetro opcional de variante (`v2` por padrão) usado por `checkoutHref` e pelos eventos; a V2 mantém o comportamento atual byte a byte.
- Tema visual: reaproveita `v2-theme.css` com uma paleta um pouco mais clara e "produtividade" (menos noturno), via classe `theme-v3` — tokens semânticos, sem cor hardcoded.
- Imagens novas (hero e, se necessário, um mock de tela) geradas como assets em `src/assets/v3/`, com `alt` descritivo e dimensões fixas para não quebrar layout.
- Nada de backend: a V3 é só frontend + medição.
