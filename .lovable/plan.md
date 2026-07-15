## Diagnóstico

Sim, correto — "O que você quer que a Aura saiba" foi pensado pra ser um diferencial: o usuário sente que **controla** o que a Aura sabe dele, não só recebe passivamente o retrato. Hoje isso não acontece porque:

1. **Fica escondido no rodapé** (linha 394 do `SobreVoceTab.tsx`), depois de 6-7 seções + tags de temas. Em perfis com retrato completo, o usuário rola muito e provavelmente não chega lá.
2. **Sem destaque visual** — usa o mesmo `SectionShell` das outras seções, então some no meio.
3. **Sem gancho na Hoje** — nada convida o usuário a contribuir.
4. **Empty state fraco** — quando o retrato está vazio, o CTA de contribuir não aparece com força; o usuário vê só "A Aura ainda está te conhecendo" e sai.

## Proposta (lean, só UX)

**1. Promover pra logo abaixo do Hero navy**
Mover o `ContribuicaoUsuario` de `linha 394` (rodapé) pra **logo abaixo do bloco Hero** (linha 261). Ordem nova: Hero → Contribuição → Pessoas → O que te move → …

**2. Dar identidade visual própria (não é "mais uma seção")**
Envolver o bloco num card com fundo levemente diferenciado (creme com borda pontilhada `border-dashed` sage) e um header maior:
- Ícone `PenLine` (já importado) em destaque.
- Título em Fraunces `"O que você quer que eu saiba"` (1ª pessoa, voz da Aura).
- Subtítulo curto: `"Adicione o que for importante — medos, objetivos, valores. Eu levo pra nossas conversas."`
- Chips dos 6 prompts sempre visíveis (medos, objetivos, desafios, valores, sonhos, marcos), não escondidos.
- Contador discreto: `"3 coisas adicionadas"` quando houver itens.

**3. Empty state forte quando o retrato ainda não existe**
Hoje o empty state (linha 226) só mostra "A Aura ainda está te conhecendo" e o usuário sai. Substituir por: **mesma mensagem + o card de contribuição já aberto embaixo**, com copy adaptada: `"Enquanto eu te conheço nas conversas, você já pode me contar o essencial aqui."` Isso vira o principal caminho de ativação pra novos usuários.

**4. Gancho na aba Hoje (opcional, pequeno)**
Quando `user_added` está vazio E o usuário tem >7 dias de conta, mostrar um card discreto na Hoje: `"A Aura conhece você pelas conversas. Quer contar algo direto? →"` linkando pra `?tab=sobre`. Marca badge de novidade uma vez. **Recomendação: fazer** — é o que faz o usuário descobrir a feature sem precisar navegar até o fim da aba.

**5. Badge "Novo" na aba Sobre**
Adicionar a chave `sobre` em `NOVIDADE_TABS` (em `UserPortal.tsx`) e disparar `bumpNovidade('sobre')` uma vez pra usuários existentes, pra chamar atenção pra área remodelada. **Trade-off**: badge some depois do primeiro clique. Recomendação: **fazer**, é barato.

## Arquivos afetados
- `src/components/portal/SobreVoceTab.tsx` — reordenar (mover `ContribuicaoUsuario` pra cima), redesenhar o header do bloco com card diferenciado, incluir bloco também no empty state.
- `src/components/portal/HojeTab.tsx` — card de convite condicional (item 4).
- `src/pages/UserPortal.tsx` + `src/components/portal/hooks/usePortalNovidades.ts` — badge "novo" em `sobre` (item 5).

Nenhuma mudança em edge/backend/schema.
