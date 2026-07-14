## Unificar Memória em "Sobre você" + convite ativo à contribuição

Você tem razão: o `Sobre você` (retrato curado pelo Gemini a partir de `user_portraits`) captura bem quem o usuário é. A `Memória` mostra a lista crua de `user_insights` — sempre vai parecer poluída por design, porque é dado técnico. Melhor eliminar a duplicidade.

### O que muda

**1. Remover a aba "Memória"**

- `src/pages/UserPortal.tsx`: remover `memoria` do array `TABS` e do render. Portal cai para 5 abas (Hoje / Sessões / Percurso / Sobre você / Meditações).
- Manter o componente `MemoriaTab.tsx` no repo por 1 release em caso de rollback, mas sem rota (ou deletar direto — decisão sua).

**2. Migrar "o que o usuário quer complementar" para dentro de Sobre você**

Nova seção no fim do `SobreVoceTab`, **antes** do rodapé "corrigir no WhatsApp":

> **"O que você quer que a Aura saiba"**
> *Coisas suas que ainda não apareceram nas conversas ou que você quer reforçar.*

- Lê de `user_insights` apenas onde `source = 'user_added'` (o que já era a parte editável da MemoriaTab).
- Renderiza como cards simples com edit/delete inline (reaproveita a lógica que já existe em MemoriaTab).
- Botão principal: **"+ Adicionar algo sobre você"**.

**3. Convite ativo com prompts sugeridos**

Quando o usuário clica em "+ Adicionar", em vez de um campo em branco, mostra um seletor de **temas sugeridos** que abrem o formulário já contextualizado:

- 🎯 **Um objetivo importante** — "Onde eu quero chegar em..."
- 😰 **Um medo ou receio** — "Uma coisa que me trava é..."
- ⚔️ **Um desafio atual** — "O que estou enfrentando agora é..."
- 💭 **Um valor inegociável** — "Uma coisa que não abro mão é..."
- 🌱 **Algo sobre quem eu quero ser** — "A pessoa que eu quero me tornar..."
- ✍️ **Outro** — campo livre

Ao escolher um tema, o formulário abre com:
- Placeholder específico do tema (o exemplo acima)
- Categoria já pré-selecionada no backend (medo→`sensivel`, objetivo→`objetivo`, desafio→`objetivo`, valor→`preferencia`, quem-quero-ser→`objetivo`, outro→`contexto`)
- Campo único de texto livre (sem exigir `key`/`value` técnicos como hoje).

Isso resolve dois problemas: (a) elimina o campo `key` técnico que ninguém sabia preencher; (b) dá ao usuário um convite real, não uma caixa em branco.

**4. Empty state contextual**

Se o usuário ainda não adicionou nada manualmente:

> *"A Aura já sabe bastante sobre você pelas conversas. Se quiser reforçar algo — um medo, um objetivo, um valor — adiciona aqui e ela leva em conta."*
> [+ Adicionar algo sobre você]

**5. Badges e navegação**

- `usePortalNovidades.ts` e `NOVIDADE_TABS`: remover a chave `memoria` se existir.
- Se algum link interno aponta pra `?tab=memoria`, redireciona pra `?tab=sobre`.

### O que não muda

- `user_insights` continua igual no banco — é a fonte de todo o portrait.
- Prompt/extractor da Aura não muda nesta rodada. Se depois quisermos apertar extração, isso vira plano separado.
- `user_portraits` (o curado) continua sendo a fonte visível — o Gemini já filtra e narra bem.
- WhatsApp "me corrige" no rodapé fica igual.

### Arquivos a editar

- `src/pages/UserPortal.tsx` — remove tab.
- `src/components/portal/SobreVoceTab.tsx` — adiciona seção "O que você quer que a Aura saiba" + seletor de prompts + form contextualizado + lista editável de `user_added`.
- `src/components/portal/hooks/usePortalNovidades.ts` — remove `memoria` se listado.
- `src/components/portal/MemoriaTab.tsx` — deletar (ou deixar não-referenciado por 1 release, sua escolha).

### Ordem

1. Adicionar a seção "O que você quer que a Aura saiba" dentro de SobreVoceTab, funcional.
2. Só depois remover a aba Memória e deletar o arquivo.

Isso evita janela em que o usuário perde acesso ao que ele mesmo adicionou.

### Fora do escopo (podemos fazer depois)

- Endurecer o extractor de `user_insights` — só faz sentido se um dia quisermos re-expor os brutos, o que não é o caso.
- Sugestões automáticas baseadas em lacunas ("você nunca falou sobre X, quer contar?").