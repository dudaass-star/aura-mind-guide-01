# Conversa como núcleo confiável do Olá Aura

## Objetivo

Fazer a Conversa parecer imediata, confiável e contínua, sem pressionar o cliente e sem competir com instalação, notificações ou outras áreas. O indicador verde de disponibilidade da AURA permanece sempre visível como expressão da presença 24/7.

## O que será construído

### 1. Confiança no envio
- Mensagens que falharem mostrarão claramente “Não enviada”.
- O cliente poderá tentar novamente ou excluir a mensagem.
- A nova tentativa reutilizará a mesma mensagem, sem criar duplicidade.
- A recuperação automática ao voltar à internet continuará existindo, mas ficará compreensível na tela.

### 2. Resposta sem espera indefinida
- A conversa confirmará imediatamente que a mensagem foi recebida e mostrará que a AURA está preparando a resposta.
- Respostas travadas terão limite seguro e recuperação visível.
- Quando houver falha antes da resposta, a conversa oferecerá uma nova tentativa sem inventar uma resposta e sem depender de WhatsApp.
- O verdinho permanecerá; o texto alternará entre “disponível”, “respondendo…” e “reconectando…”.

### 3. Redução da latência
- Separar o tempo de aceite, início do processamento, geração e primeira resposta.
- Retirar do caminho da primeira resposta tarefas que podem acontecer depois.
- Eliminar esperas artificiais no canal do app.
- Preservar a divisão natural em poucas mensagens, mas entregar a primeira assim que estiver pronta.
- Medir faixas de resposta em até 3, 5, 10 e 30 segundos.

### 4. Continuidade e entrada direta
- Ações cujo destino já é conversar abrirão diretamente a conversa da AURA.
- Retornos por notificação abrirão o ponto correto do app.
- Continuidade de sessão, jornada ou assunto anterior aparecerá somente quando houver relação concreta.
- Toda leitura psicológica continuará sendo hipótese verificável; o cliente poderá corrigir sem atrito.
- Conversas casuais poderão terminar naturalmente, sem cobrança automática pelo silêncio.

### 5. Descoberta progressiva
- Instalação, notificações e descoberta de outras áreas não aparecerão simultaneamente.
- Nenhum convite interromperá gravação, texto sendo escrito ou resposta em andamento.
- Pedidos de instalação e notificações serão apresentados depois de valor percebido.
- A Conversa mostrará no máximo um convite secundário por vez.

### 6. Retenção e LTV
- Medir retorno à conversa em 1, 7 e 30 dias, recorrência semanal e transições úteis para Sessões e Jornadas.
- Medir falhas, reenvios, respostas sem conclusão e correções por 100 conversas.
- Relacionar uso recorrente com permanência e mudança de plano, sem fazer oferta durante vulnerabilidade emocional.

## Validação

- Simular texto e áudio com rede normal, lenta, offline e reconexão.
- Simular falha antes e depois da primeira resposta, nova tentativa e envio concorrente.
- Confirmar que nenhuma mensagem é duplicada e nenhuma conversa fica eternamente em “respondendo…”.
- Validar teclado, rolagem, áudio, retorno por notificação e convites em celular e computador.
- Comparar os tempos reais antes e depois; validar tipos e testes existentes.

## Ordem de entrega

1. Recuperação de falhas e estados confiáveis.
2. Latência real e primeira resposta.
3. Entrada direta e continuidade.
4. Convites progressivos.
5. Métricas e simulação completa.
