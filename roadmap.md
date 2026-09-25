[x] Padronizar episódios e conclusão de Jornadas com o visual atual do aplicativo e confirmar o acesso global isolado por cliente.
- [x] Transformar a antiga entrada do Meu Espaço na entrada visual e textual do aplicativo Olá Aura.
- [x] Padronizar Olá Aura como nome do aplicativo e AURA como a pessoa da conversa, deixando WhatsApp apenas como recuperação de acesso.
- [x] Corrigir os destinos de Hoje e Sobre você para abrir a conversa interna com contexto, sem desviar o cliente ao WhatsApp.
- [x] Separar resumo semanal e relatório mensal, com cartões na conversa e histórico no Percurso.
# Roadmap

- [ ] Compactar horários na conversa e corrigir a resposta automática após duas mensagens seguidas, sem botão de retomada; correção aplicada e validada no fluxo real após publicação.

- [x] Preparar a conta compartilhada fictícia da Marina (33 anos) com acesso por link temporário, histórico coerente, conversa e sessão verificadas para UGC; excluir cobranças, avisos e métricas reais.

- [x] Criar a segunda rodada de criativos estáticos para Meta Ads com produto, mecanismo e oferta compreensíveis sem depender da legenda.
- [x] Criar e validar a Landing V4 com transformação como protagonista e o App como prova concreta do valor.
- [x] Reposicionar e validar a Landing V4 com sessão guiada de 45 minutos como protagonista.
- [x] Reequilibrar a Landing V4 com conversa real do App, diálogo humano de impacto e funcionalidades com valor próprio.
- [x] Diferenciar visualmente as sessões da conversa na abertura da Landing V4 reproduzindo fielmente a tela real de Sessões.
- [x] Conectar Jornadas, Meditações, Sobre você e Percurso à demonstração de valor da Landing V4 com telas fiéis do App.
- [x] Reposicionar a oferta da Landing V4 no Essencial: entrada por R$ 6,90, continuidade por R$ 29,90 e planos maiores como opção secundária.
- [x] Enxugar a Landing V4 e aproximar da oferta a prova social confirmada por avaliações reais de sessões.
- [x] Reforçar a marca na abertura da Landing V4 e apresentar a experiência AURA antes do diferencial da sessão.
- [x] Incluir a Landing V4 no Google Analytics e Clarity e preservar origem, plano e ciclo no retorno de cancelamento do checkout externo.
- [x] Corrigir a defesa automática de disputas Woovi: sincronização recorrente, envio das elegíveis e alerta para disputa aberta sem evidência.

- [x] Transformar Jornadas em continuidade ativa: cadência fixa, um episódio pendente, leitura confirmada, reflexão, escolha guiada e métricas.

- [x] Painel semanal do funil Taster no admin (TasterFunnelPanel em AdminWhatsappRecovery)
- [x] Antecipar convite m3 de ~48h para ~6h, âncora em wa_copiou_2h_sent_at (trilho separado do genérico)
- [x] Porta B: bloquear só inbound recente (<24h) ou oferta já existente — conversa fria volta a receber convite
- [x] Lembretes do código não pago (+45min e manhã seguinte 09h BRT) via execute-scheduled-tasks, cancelados no pagamento (webhook-woovi → cancelTasterReminders)
- [x] Painel separado de disparos de cobrança com filtros, pessoas distintas, status de entrega e ofertas aceitas

Tudo concluído em 10/09/2026. Funções publicadas; painel de cobrança separado da recuperação de checkout e retorno real de entrega ativado.
- [x] Remover silêncio do recovery-agent ao atingir limite, preservando pausas explícitas
- [x] Validar suporte a cliente ativo após 8 respostas e responder a pergunta pendente
- [x] Remover cirurgicamente dados pessoais reais das três orientações globais contaminadas
- [x] Limpar somente a memória incorreta de Ana e validar o isolamento entre usuários
- [x] Corrigir reenvio e regeneração do PIX recorrente no agente de recuperação, sem misturar com Taster
- [x] Separar objeção comercial de opt-out e reconhecer aceite contextual do Lite após oferta entregue
- [x] Evoluir a Landing V2 para vender transformação com clareza concreta sobre produto e oferta
- [x] Tornar a demonstração da Landing V2 mais rápida, humana e impactante com uma dor real recorrente
- [x] Tornar a chamada principal da Landing V2 mais concreta, com escuta, direção e movimento
- [x] Resolver especificamente quando o cliente não recebe o código do Meu Espaço com link seguro de uso único pelo WhatsApp cadastrado
- [x] Entregar no chat o relatório de churn por mês de vida e LTV, sem alterar o painel
- [x] Unificar o fluxo de retenção do envio à reativação, com rastreamento e reconciliação por oferta
- [x] Corrigir reativação por gateway, links de winback, PIX com menos atrito e identificação por cliente
- [x] Validar em simulação segura entrega, clique e evolução até pagamento/liberação; confirmações reais seguem por webhook e reconciliação horária
- [x] Planejar transformação da AURA em aplicativo web principal, com WhatsApp como canal auxiliar
- [x] Revisar plano do aplicativo com requisitos rigorosos de fluidez, latência e paridade com WhatsApp
- [x] Construir a base da Fase 1: conversa autenticada por texto, tempo real, idempotência, histórico e resposta persistente
- [x] Completar a Fase 1: áudio, telemetria, interrupção, fila durável e reconexão validados no aplicativo publicado
- [x] Auditar e reaproveitar no aplicativo as regras maduras de fluidez e negociação de turnos já usadas no WhatsApp, separando apenas o que depende do canal
- [x] Validar conversa web com conta isolada: envio, resposta, histórico, tempo real, idempotência, isolamento e reconexão entre três abas
- [x] Construir Fase 2 do aplicativo: navegação centrada na conversa, áudio, conta e instalação
- [ ] Executar piloto controlado e validar fluidez, segurança e continuidade antes da migração
- [x] Redesenhar o aplicativo com entrada por conversas, perfil da AURA e experiência premium familiar ao WhatsApp
- [x] Aplicar a direção Inbox-first: abertura sempre na lista, conversa principal e navegação premium para as demais áreas

- [x] Conferir se a navegação simples entre conversa e demais áreas já estava entregue antes de criar uma segunda navegação

- [x] Validar o fluxo mobile completo: lista de conversas, conversa da AURA, retorno e acesso às demais áreas sem sobreposição
- [x] Reunir pagamento, troca de plano e saída no menu de três pontos da tela inicial
- [x] Fechar instalação do Meu Espaço na tela inicial com identidade AURA e orientação para iPhone
- [x] Priorizar entrada pessoal pelo WhatsApp, preservar sessão no aparelho e usar código de email apenas como recuperação
- [x] Exibir convite pós-entrada para instalar a AURA, com instalação nativa quando disponível e guia no iPhone
- [x] Revisar e aprimorar o plano da entrada normal com referências de mercado, priorizando conversão e LTV sem descaracterizar a AURA

- [x] Implementar entrada normal integrada: intenção segura, liberação pós-pagamento, proteção de recursos e métricas de confirmação
- [ ] Validar a liberação automática com uma compra real de cada trilho (cartão, PIX Asaas, PIX Inter e PIX Woovi); depende de transações reais dos provedores
- [x] Proteger a troca de jornada no servidor com identidade válida e acesso ativo, eliminando alteração por user_id exposto
- [x] Garantir acesso automático também no fallback do cartão e oferecer recuperação clara se a entrada automática falhar
- [x] Preservar o acesso automático quando o cliente faz mais de uma tentativa de pagamento no mesmo aparelho
- [x] Tratar indisponibilidade temporária da Woovi sem expor erro técnico no checkout
- [x] Implementar notificações no aplicativo: ativação guiada, registro seguro por aparelho e aviso discreto de nova resposta
- [ ] Migrar comunicações elegíveis para estratégia push-first com fallback WhatsApp, personalização segura e métricas de conversão/LTV — roteador e primeira etapa (sessões, jornadas e resumos) implementados; falta piloto real de 7–14 dias
- [x] Personalizar a primeira semana com poucos dados: usar sinais do checkout, onboarding e primeiras interações para aumentar ativação e conversão ao mensal sem elevar a frequência
- [x] Criar descoberta guiada de valor na primeira semana: apresentar progressivamente conversa, sessão, jornada, práticas, áudios e progresso conforme o que o cliente ainda não experimentou
- [x] Fechar lacunas do push: programar avisos não urgentes no melhor horário e centralizar nova resposta com deduplicação e abertura rastreável

- [x] Simular cenários reais de notificações por perfil, canal, horário, presença, limite e fallback; corrigir divergências encontradas.
- [x] Reagendar respostas recebidas no silêncio e adiar o segundo conteúdo não urgente para o dia seguinte, sem elevar a frequência.
- [x] Ampliar cenários extremos de push e proteger métricas de abertura/conversão, tokens inválidos e duplicidade entre clientes.
- [x] Corrigir colisão global de idempotência, cap pelo dia real de entrega e duas novas tentativas em falhas transitórias.
- [x] Diferenciar entrega por aparelho, app aberto e sucesso/falha do fallback nas métricas de notificação.
- [x] Auditar a conversa em Android e iPhone e corrigir indicador de resposta coberto, áreas seguras, telas pequenas, áudio e convites que interrompiam a escrita.
- [ ] Configurar os dados públicos do Web Push com o cliente e validar ativação, registro, envio, abertura e direcionamento em aparelho real.
- [x] Refinar visual da conversa com direção grafite + jade, superfícies tonais e contraste premium, preservando a fluidez de digitação.
- [x] Adicionar cor equilibrada à tela inicial, destacando a conversa e diferenciando cada área sem perder sobriedade.
- [x] Unificar Hoje, Sessões, Percurso, Meditações e Sobre você ao novo padrão visual e estrutural do aplicativo.
- [x] Reintegrar Jornadas de Conteúdo como área própria, com progresso, episódios liberados, histórico e escolha segura.
- [x] Transformar Jornadas em biblioteca viva, com releitura das concluídas e visão segura das próximas etapas e temas.
- [x] Compactar mensagens de voz enviadas e recebidas em uma linha, com progresso, duração e velocidade.
- [x] Preservar a reprodução do áudio local depois da confirmação de envio, sem substituí-lo por um endereço privado.
- [x] Corrigir duração indefinida dos áudios gravados no celular e validar reprodução completa após reabrir a conversa.
- [x] Gravar áudio em MP4/AAC no iPhone e iPad, mantendo formato compatível nos demais aparelhos.
- [x] Corrigir o desenquadramento da conversa ao abrir o teclado, com validação em iOS e Android.
- [x] Separar pedido pontual de áudio de preferência contínua e restaurar o modo automático do perfil afetado.
- [x] Padronizar episódios e conclusão de Jornadas com o visual atual do aplicativo e confirmar o acesso global isolado por cliente.
- [x] Transformar Percurso em acompanhamento vivo, corrigindo links, confiança, retomada, marcos e validação pelo cliente.

- [x] Separar relatórios semanais e mensais, entregá-los na conversa e arquivá-los no Percurso.
- [x] Elevar relatórios com evidências verificáveis, períodos fechados, síntese da AURA e correção pelo cliente; validar em clientes reais antes da publicação.
- [x] Unificar o pós-pagamento no app Olá Aura: confirmação, PIX, WhatsApp, e-mail, acesso e remoção de “Meu Espaço” da experiência visível.
- [x] Otimizar abertura e navegação do app e validar capacidade controlada em 50, 100, 200 e 300 acessos simultâneos (abertura e leitura autenticada; geração simultânea da AURA continua sendo uma capacidade separada).
- [x] Substituir Jornadas completas na conversa por cartões compactos que abrem diretamente o episódio no app.
- [x] Permitir agendar, reagendar e cancelar sessões diretamente no aplicativo, com lembretes de 24h e 5min.
- [x] Auditar e simular o agendamento de ponta a ponta: concorrência, limites, segurança, reagendamento, cancelamento, lembretes e tela móvel.
- [x] Permitir que o cliente agende uma, algumas ou todas as sessões do mês até a cota do plano, com gestão individual e upgrade contextual ao esgotar a cota.
- [x] Unificar as regras de cota, conflito e concorrência entre o aplicativo e todos os agendamentos feitos pela conversa, usando as sessões reais do mês em Brasília.
- [x] Evoluir Sessões para continuidade dos encontros: confiabilidade app-first, agenda mensal, entrada direta, preparação, pós-sessão, hipóteses verificáveis e métricas.
- [x] Evoluir Hoje como direção diária do cliente: prioridade contextual, continuidade entre áreas, retorno recorrente e medição de retenção/LTV.
- [x] Destacar a preparação do encontro e entregá-la à AURA na abertura, priorizando a intenção atual sem perder a ponte anterior e os compromissos relevantes.
- [x] Evoluir Conversa como núcleo do aplicativo: recuperação de falhas, resposta rápida, continuidade, descoberta progressiva e métricas de retenção/LTV.
- [x] Evoluir Jornadas como continuidade ativa: dois episódios semanais, sem acúmulo, leitura explícita, reflexão, conversa contextual, escolha guiada e métricas.
- [x] Corrigir e validar ponta a ponta todos os fluxos de Jornadas, incluindo conversa contextual real sobre o episódio.
- [x] Acelerar a reabertura já autenticada e a troca entre áreas, preservando a última tela enquanto os dados são atualizados.
- [x] Evoluir Sobre você como retrato confiável: privacidade, origem, hipóteses verificáveis, correção direta, atualização e métricas.
- [x] Substituir o nível de intimidade por continuidade qualitativa, sem pontuação, comparação ou recompensa por exposição pessoal.
- [x] Conduzir os primeiros 14 dias por Hoje + push para apresentar progressivamente duas ou três formas de valor, sem interferir no chat.
- [x] Corrigir a condução inicial para usar experiências reais, calendário BRT, novas tentativas de push e conversões específicas por ação.
- [x] Preparar a condução inicial para escala com lotes, retomada segura, leituras eficientes e conversão completa de texto/áudio/reenvio/fila offline.
- [x] Transformar Hoje no orquestrador de um único próximo passo contextual.
- [ ] Consolidar push-first e validar retorno ao aplicativo em aparelhos reais.
- [ ] Criar retenção adaptativa com um convite relevante por comportamento.
- [ ] Unificar coortes, retenção e LTV no painel administrativo.
- [ ] Executar piloto monitorado de 14–30 dias do ciclo integrado de retenção.
- [x] Refazer do zero os três conceitos prioritários de anúncios estáticos, com composições próprias para Feed e Stories e CTA previsto desde o início.
- [x] Encantar clientes na migração WhatsApp → App, comunicando ganhos reais antes da mudança de canal e reduzindo resistência.
- [x] Criar e validar a recepção ativa do cliente novo no App, com primeira sessão independente do WhatsApp.
- [ ] Corrigir os riscos residuais da conversa: detalhamento do erro 500, proteção do TypeError, espera em reenvio duplicado e teste controlado da retomada automática concluídos; causa original do erro 500 não reproduzida, acompanhar novos registros e piloto com clientes reais.
- [x] Manter a caixa de mensagem vazia visível assim que o teclado abrir no celular e validar foco e digitação em navegador móvel com teclado simulado; confirmar em aparelho físico no piloto.
