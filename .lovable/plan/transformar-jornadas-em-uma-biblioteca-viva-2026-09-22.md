# Transformar Jornadas em uma biblioteca viva

## Objetivo
Fazer a área de Jornadas mostrar claramente o que o cliente já pode rever, o que está acompanhando agora e tudo que ainda poderá descobrir, aumentando a percepção contínua de valor sem liberar conteúdo antes da hora.

## O que será ajustado
- Tornar cada jornada concluída consultável, com acesso a todos os seus episódios já conquistados.
- Organizar a tela em três momentos fáceis de entender: “Em andamento”, “Já concluídas” e “Para descobrir”.
- Exibir na jornada atual todos os 8 episódios em uma linha de progresso visual:
  - episódios liberados com título e acesso;
  - próximo episódio destacado como “Próximo”; 
  - demais episódios visíveis como etapas futuras, sem revelar seus títulos ou conteúdos.
- Mostrar as outras jornadas ativas mesmo enquanto uma está em andamento, com tema, descrição e quantidade de episódios, mas sem permitir trocar acidentalmente de jornada.
- Nas jornadas concluídas, abrir uma visão expansível com os 8 episódios para releitura, sem reiniciar o progresso.
- Manter “Refazer jornada” separado da consulta e exigir uma confirmação clara antes de substituir a jornada atual.
- Usar textos de expectativa honestos, como “Novos episódios chegam ao longo da jornada”, sem inventar data exata.

## Regras preservadas
- Episódios futuros continuam bloqueados e não terão conteúdo sensível carregado no navegador.
- O ritmo atual de liberação continua igual.
- Histórico, progresso, notificações e escolha segura de próxima jornada permanecem funcionando.
- A nova apresentação seguirá o visual premium já aprovado no aplicativo.

## Validação
- Testar cliente com jornada em andamento, sem jornada, com uma e com várias jornadas concluídas.
- Confirmar consulta de todos os episódios concluídos e retorno correto para Jornadas.
- Confirmar que episódios futuros aparecem como expectativa, mas não podem ser abertos.
- Verificar celular e computador, sem cortes, sobreposição ou rolagem lateral.
