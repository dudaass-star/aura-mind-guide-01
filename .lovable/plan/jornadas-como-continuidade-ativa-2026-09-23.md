# Jornadas como continuidade ativa

## Objetivo
Transformar Jornadas de uma biblioteca passiva em um acompanhamento leve entre conversas e sessões: liberar, consumir, refletir, conversar e voltar. A evolução será validada antes de produzir novas jornadas.

## Regras de experiência
- Dois episódios por semana, em dias fixos e horário BRT.
- A cadência representa oportunidades de avanço, não uma obrigação.
- Somente um episódio pode permanecer pendente por vez.
- Se o episódio anterior não foi concluído, o próximo não é liberado e não há nova notificação de lançamento.
- Um lembrete leve pode ser enviado após alguns dias, sem insistência ou linguagem de cobrança.
- Cliente novo escolhe primeiro o que deseja cuidar; a sugestão de jornada nasce dessa resposta declarada.
- Sugestões posteriores da AURA são sempre hipóteses verificáveis: mostram o motivo e perguntam se faz sentido.
- WhatsApp permanece como contingência. O aplicativo e as notificações do aparelho são o caminho principal.

## Bloco 1 — Integridade e confiança
- Criar um registro individual do acompanhamento de cada episódio: liberado, aberto, em leitura e concluído.
- Considerar uma jornada concluída somente quando o cliente confirmar a conclusão do último episódio.
- Separar jornada concluída, pausada e trocada; pausar ou trocar nunca gera uma falsa conclusão.
- Preservar o histórico real e permitir retomada sem perder o ponto alcançado.
- Centralizar as ações de começar, trocar, pausar, retomar, abrir, salvar progresso e concluir com validação do acesso do cliente.

## Bloco 2 — Cadência e notificações
- Substituir o intervalo aproximado de 2,5 dias por duas janelas semanais fixas em BRT.
- Tornar a liberação independente da existência de telefone.
- Impedir a liberação do próximo episódio enquanto existir um episódio pendente.
- Enviar aviso do novo episódio primeiro pelo aplicativo; usar WhatsApp apenas quando a contingência for aplicável.
- Mostrar na área Jornadas a previsão leve da próxima oportunidade de episódio.
- Evitar sequência de avisos e vários episódios acumulados após uma ausência.

## Bloco 3 — Leitura e continuidade
- Mostrar estados claros: **Novo**, **Em leitura** e **Concluído**.
- Salvar automaticamente o ponto de leitura e oferecer um único botão principal para continuar.
- Ao final, oferecer três ações opcionais: **Concluir episódio**, **Guardar o que ficou comigo** e **Conversar com a AURA sobre isso**.
- A reflexão guardada será tratada como declaração do cliente, nunca como diagnóstico ou interpretação psicológica.
- Ao abrir a conversa pelo episódio, levar somente o contexto necessário: jornada, episódio e reflexão escrita pelo cliente.
- Após concluir o último episódio, oferecer: escolher a próxima, decidir depois ou conversar sobre o que ficou — sem seleção automática em 48 horas.

## Bloco 4 — Escolha e descoberta
- Para quem ainda não conversou ou fez sessão, apresentar uma escolha guiada por objetivo atual, além da opção de conhecer todas as jornadas.
- Relacionar cada objetivo a uma jornada candidata e apresentar a indicação como possibilidade confirmável.
- Para quem já possui contexto suficiente, permitir sugestão da AURA com evidência concreta do que o próprio cliente trouxe.
- Explicar duração, frequência e proposta de cada jornada antes de começar.
- Permitir pausar, retomar ou trocar diretamente no aplicativo, com confirmação clara das consequências.

## Bloco 5 — Integração e validação de valor
- Fazer o episódio pendente aparecer em Hoje como continuidade, sem competir com sessão ou conversa prioritária.
- Atualizar o cartão na Conversa para refletir Novo, Em leitura ou Concluído.
- Medir: liberação → aviso → abertura → início → conclusão → reflexão → conversa → próximo episódio.
- Medir tempo até a primeira abertura, retorno ao episódio seguinte, conclusão de jornada e início de outra.
- Comparar retenção e evolução de plano entre quem usa Jornadas e quem não usa, sem atribuir causalidade automaticamente.
- Não expandir o catálogo antes de observar se o novo ciclo aumenta consumo e continuidade.

## Detalhes técnicos
- Criar uma estrutura própria de progresso por cliente e episódio, protegida para que cada pessoa veja e altere apenas seus registros.
- Migrar o estado atual com segurança: episódios já liberados permanecem acessíveis; jornadas antigas só permanecem como concluídas quando houver evidência suficiente, sem apagar conteúdo do cliente.
- Manter compatibilidade temporária com os links de episódios já enviados.
- Atualizar a rotina de liberação, a seleção/troca de jornada, a leitura, Hoje, Conversa e o contexto entregue à AURA.
- Usar operações idempotentes para impedir liberação, conclusão, reflexão ou notificação duplicadas.

## Verificação antes de concluir
- Simular cliente novo sem contexto, cliente com objetivo declarado e cliente com histórico de conversa/sessão.
- Simular episódio novo, aberto, parcialmente lido, concluído e último episódio.
- Simular atraso em uma e várias janelas sem liberar ou notificar conteúdo acumulado.
- Simular pausa, retomada, troca e tentativa concorrente em dois aparelhos.
- Confirmar que reflexão e conversa recebem apenas conteúdo declarado pelo cliente.
- Validar celular e computador, links antigos, notificações, ausência de telefone e falhas de conexão.
- Validar regras de acesso, testes automatizados e indicadores do funil antes de declarar a área pronta.

## Critério de sucesso
Jornadas estará pronta quando a conclusão representar consumo real, nenhum cliente acumular episódios ou avisos, a entrada inicial não fingir conhecimento psicológico e cada episódio puder gerar uma continuidade natural com a AURA. O impacto em retenção e LTV dependerá de observação real após a publicação.
