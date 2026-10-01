# Diferenciar a entrada de Participante e Embaixador

## O que será ajustado
- Manter um único cadastro gratuito para o Movimento, sem duplicar conta ou dados.
- Quando a pessoa vier pelo botão de Embaixador, apresentar título, explicação, aceite e botão próprios desse caminho.
- Na confirmação, registrar de uma vez a participação e a adesão voluntária como Embaixador.
- Quem vier pelo botão de Participante continuará entrando apenas como Participante e poderá escolher ser Embaixador depois.

## Validação
- Conferir os dois caminhos no celular: Participante e Embaixador.
- Confirmar que o caminho de Embaixador abre diretamente as ferramentas de compartilhamento e impacto.
- Verificar compilação e ausência de erros na tela.

## Detalhes técnicos
- Usar a intenção `papel=embaixador` já preservada no acesso.
- Gravar `ambassador_since` já na criação do membro apenas nesse caminho.
- Registrar o evento de adesão como Embaixador após a criação bem-sucedida.
