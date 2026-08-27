# Sessões nota 4: por que a Aura repetiu a mesma pergunta (e os 4 ajustes)

## Por que ela perguntou "por onde a gente começa?" várias vezes

A sessão tem fases (Abertura → Foco → Exploração → Reframe → Fechamento). A cada mensagem do usuário, o sistema injeta no contexto da Aura um bloco com o **objetivo da fase atual**. Na fase de Foco esse bloco diz, literalmente: "OBJETIVO: escolher por onde começar o trabalho real" com exemplos de pergunta prontos.

O problema: quem decide avançar de fase é um avaliador que exige um número mínimo de trocas antes de liberar a próxima fase. Quando a usuária já respondeu "hoje é a mágoa" logo na segunda mensagem, o tema já estava definido — mas a fase continuou marcada como Foco. Resultado: o mesmo bloco de instrução voltou a ser injetado turno após turno, e a Aura, obedecendo, refez a pergunta de foco 5 vezes.

Ou seja: não foi esquecimento nem falta de memória. Foi uma instrução repetida por um contador que não sabia que o objetivo já tinha sido cumprido.

## Os 4 ajustes propostos

1. **Trava do foco definido**
   Assim que o tema da sessão estiver definido (o extrator já detecta isso), o bloco de foco para de ser injetado e é substituído por "o tema já é X — aprofunde, não pergunte de novo". Fase avança por objetivo cumprido, não só por contagem de mensagens.

2. **Fim das menções a minutos**
   Remover do prompt as falas de relógio ("faltam 10 minutos", "vamos começar a fechar"). O tempo continua guiando o sistema por dentro, mas deixa de aparecer na conversa cortando momentos emocionais.

3. **Rating não atropela a despedida**
   Hoje o pedido de nota chegou ~5 segundos antes da última fala da Aura. A trava vai passar a considerar também há quanto tempo a última mensagem foi entregue, adiando o pedido de nota se a despedida ainda estiver saindo.

4. **Limpeza de resíduo visual**
   Sanear os separadores de bolha para não gerar mensagens com reticências soltas (". . .") ou bolhas vazias.

## Detalhes técnicos

- `supabase/functions/aura-agent/index.ts`: bloco de fase FOCO (~linha 6102) passa a ser condicional ao tema já extraído; remover instrução de minutos (~linha 4022) e ajustar os avisos de fase (~1617/1635).
- `supabase/functions/session-reminder`: incluir idade da última mensagem entregue na condição de disparo do rating.
- Sanitização de `|||` na função de split de mensagens, descartando fragmentos só com pontuação.
- Testes unitários existentes atualizados para cobrir foco-definido e split limpo.

## Risco

Baixo. São todas travas restritivas (deixam de fazer algo) e não adicionam nova lógica que o modelo precise interpretar.
