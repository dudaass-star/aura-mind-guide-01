# Elevar o aplicativo AURA ao nível premium

## Objetivo

Transformar a entrada do aplicativo em uma experiência familiar de mensagens: o cliente vê a conversa com a AURA, reconhece sua foto e nome, toca para entrar e encontra uma conversa fluida, elegante e acolhedora. A estrutura ficará pronta para receber novos recursos no futuro sem poluir a experiência principal.

## Experiência

- A primeira tela será **Conversas**, não a conversa já aberta.
- A conversa da **AURA** aparecerá como o contato principal, com foto, nome, prévia da última mensagem, horário, indicador de novidade e presença.
- Ao tocar, a conversa abre em tela inteira no celular, com cabeçalho próprio, botão de voltar, foto da AURA, nome e estado de resposta.
- Em telas maiores, lista e conversa poderão aparecer lado a lado, mantendo familiaridade e aproveitando melhor o espaço.
- A tela de conversas terá uma área discreta preparada para futuros recursos, sem inventar itens vazios agora.

## Direção visual

- Usar a familiaridade do WhatsApp na hierarquia e nos gestos, sem copiar sua marca ou parecer uma imitação.
- Manter a identidade da AURA: tipografia editorial, tons naturais, contraste refinado, foto humana e detalhes de alta qualidade.
- Reduzir o aspecto de painel e elevar a percepção de produto: melhor escala, respiro, divisores, estados de toque, transições e acabamento mobile.
- Usar somente cores e sombras do sistema visual do projeto.

## Implementação

- Separar a lista de conversas da conversa aberta, preservando toda a lógica já validada de envio, áudio, histórico, tempo real, interrupção e reconexão.
- Levar a navegação principal para uma estrutura própria de aplicativo, especialmente no celular, sem competir com a conversa.
- Usar a foto existente da AURA e dados reais da última mensagem para compor a entrada.
- Preservar as demais áreas atuais e preparar a tela inicial para novos espaços futuros.

## Validação

- Conferir visual e navegação em celular e desktop.
- Validar entrada na conversa, retorno à lista, envio de texto e áudio, histórico e indicador de resposta.
- Confirmar que teclado, rolagem e campo de mensagem permanecem estáveis no celular.
- Revisar contraste, cortes, sobreposições e sensação de velocidade antes de concluir.
