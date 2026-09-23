# Corrigir teclado no iPhone e áudio pontual

## Resultado esperado
- A conversa continua enquadrada quando o teclado do iPhone abre ou fecha.
- Pedir “um áudio para teste” gera apenas aquela resposta em áudio.
- O áudio contínuo só é ativado quando a pessoa declara uma preferência duradoura, como “prefiro receber áudio”.

## Implementação
- Sincronizar a altura da conversa com a área realmente visível do navegador e compensar o deslocamento causado pelo teclado do iOS.
- Manter o campo e a mensagem mais recente visíveis durante a abertura e o fechamento do teclado.
- Separar pedidos pontuais de áudio das frases de preferência persistente nos dois pontos que processam mensagens.
- Restaurar o perfil afetado para o modo automático.
- Adicionar testes de regressão para pedidos de teste, pedidos pontuais e preferências explícitas.

## Validação
- Executar os testes das funções de conversa e áudio.
- Conferir a conversa em viewport móvel com abertura e fechamento do teclado quando possível.
- Publicar as funções alteradas e confirmar o modo automático no perfil afetado.
