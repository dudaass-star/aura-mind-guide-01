# Correção cirúrgica do pedido “não mande áudio”

## O que aconteceu

A falha está identificada no turno exato da Bruna:

1. Bruna escreveu **“Não mande áudio”**.
2. Os dois reconhecedores atuais de preferência não incluem essa formulação. Eles reconhecem formas próximas, como “não manda áudio”, “não quero áudio” e “sem áudio”, mas não o imperativo **“não mande áudio”**.
3. Por isso, o pedido não foi registrado como preferência por texto e o perfil continuou em modo automático.
4. A IA entendeu o sentido e escreveu **“Pode deixar, sem áudio”**, porém isso controlou apenas o conteúdo da resposta.
5. Como o sistema ainda considerava aquele momento um fechamento de sessão, sua regra determinística marcou a resposta como áudio obrigatório. Essa regra envia áudio mesmo quando a IA não coloca a marca de áudio.
6. Resultado: a Aura prometeu texto no conteúdo, mas a camada de envio transformou a mesma resposta em áudio. Depois, “Desisto” também foi tratado como fechamento e gerou outro áudio porque a preferência ainda não havia sido registrada.

Portanto, não foi uma decisão psicológica da Aura nem uma falha geral de envio. Foi uma lacuna literal na identificação do pedido, combinada com a regra já existente de áudio no fechamento.

## Correção mínima

1. Acrescentar às duas identificações existentes as formas naturais que apareceram no caso, sem reformular toda a lógica:
   - “não mande áudio” / “não envie áudio”;
   - “prefiro ler”;
   - “responda/converse por mensagem”;
   - “não quero ouvir áudio”.
2. Manter a precedência atual: uma vez reconhecido o pedido, texto já vence abertura e fechamento de sessão.
3. Adicionar testes focados nessas frases, comprovando que:
   - a preferência é registrada como texto;
   - o fechamento deixa de forçar áudio;
   - pedidos explícitos de áudio continuam funcionando normalmente.
4. Publicar apenas as duas funções envolvidas e validar o cenário da Bruna de ponta a ponta.

## Fora do escopo

Não alterar orçamento de áudio, meditações, regras de crise, duração da preferência, espelhamento de voz ou arquitetura de envio nesta correção. Esses pontos podem ser avaliados separadamente, mas não são necessários para resolver a falha comprovada da Bruna.
