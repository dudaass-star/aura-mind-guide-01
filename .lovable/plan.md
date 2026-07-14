## Plano: Protótipos clicáveis do redesign do /meu-espaco

Vou seguir o caminho B (protótipos renderizados em HTML/Tailwind reais), pra você poder abrir cada direção no navegador e sentir densidade, hierarquia e ritmo de verdade — não só o clima visual.

### Passo 1 — Capturar o Portal atual (referência visual)
- Rodar Playwright autenticado no seu usuário (Eduardo), mesma rota que já usei antes.
- Screenshots das abas principais: **Hoje**, **Percurso**, **Sobre você**, **Sessões**.
- Salvar em `/tmp/browser/portal-redesign/` como referência que vai junto na geração das direções (obrigatório — sem screenshot, a ferramenta recusa).

### Passo 2 — Fixar a paleta e tipografia (travadas nas 3 direções)
Herdadas da landing V2 (`src/styles/v2-theme.css`), sem drift:
- **Cores**: creme `#F5F0E8` (bg), sage `#87A878` (primário), navy `#1B2A4E` (hero/hierarquia), lavender `#B8A5D9` (acento), tinta escura para texto.
- **Fontes**: Fraunces (display/quotes), Nunito (corpo/UI).
- **Layout base**: mesma estrutura de 5 abas atual, mesmo conteúdo — só muda composição, hierarquia e emoção.

### Passo 3 — Gerar 3 direções distintas
Cada uma com um ponto de vista próprio (mesma paleta/tipografia, composições diferentes):

**Direção 1 — "Editorial Íntimo"**
Sensação de revista literária. Hero grande em navy com Fraunces XL, muito respiro, citações literais em blockquote destacado, capítulos do Percurso como capas de revista mensal. Densidade baixa, emoção alta.

**Direção 2 — "Painel Vivo"**
Sensação de dashboard pessoal quente. Grid bento com cards de tamanhos variados na "Hoje" (última sessão, próxima, insight, intimidade), sage e lavender usados como códigos de cor por tipo de conteúdo. Densidade média, navegação rápida.

**Direção 3 — "Diário Contínuo"**
Sensação de caderno costurado. Coluna única centrada, tudo lido de cima pra baixo como um diário, transições suaves entre seções, marcadores tipo margin notes em lavender. Densidade alta em texto, emoção contemplativa.

### Passo 4 — Você escolhe
Apresento as 3 lado a lado via pergunta do tipo `prototype` (clicáveis, renderizadas). Você abre, navega, escolhe uma. Zero ambiguidade — uma pergunta só: "Qual direção implementar?"

### Passo 5 — Implementação (só depois da sua escolha)
- Copio os tokens/composição da direção escolhida verbatim pra dentro do Portal real.
- Scope via `.theme-v2` wrapper em `/meu-espaco` pra não vazar pro resto do app.
- Aplico aba por aba: Hoje → Percurso → Sobre você → Sessões → Assinatura.
- Sanitizo o que já mapeamos (prefixo `[CONTENT]`, markdown cru, pluralização) no mesmo passe.

### O que fica de fora deste plano
- Nenhuma mudança de lógica de negócio, queries, edge functions ou dados.
- Nenhuma mudança na landing V2 ou em outras rotas.
- Sanitização de dados fica na implementação (passo 5), não nos protótipos.

Aprova pra eu começar pelo passo 1 (captura + geração das 3 direções)?
