[x] Padronizar episódios e conclusão de Jornadas com o visual atual do aplicativo e confirmar o acesso global isolado por cliente.
- [x] Transformar a antiga entrada do Meu Espaço na entrada visual e textual do aplicativo Olá Aura.
- [x] Padronizar Olá Aura como nome do aplicativo e AURA como a pessoa da conversa, deixando WhatsApp apenas como recuperação de acesso.
- [x] Corrigir os destinos de Hoje e Sobre você para abrir a conversa interna com contexto, sem desviar o cliente ao WhatsApp.
- [x] Separar resumo semanal e relatório mensal, com cartões na conversa e histórico no Percurso.
# Roadmap

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
- [x] Corrigir o desenquadramento da conversa ao abrir o teclado, com validação em iOS e Android.
- [x] Separar pedido pontual de áudio de preferência contínua e restaurar o modo automático do perfil afetado.
- [x] Padronizar episódios e conclusão de Jornadas com o visual atual do aplicativo e confirmar o acesso global isolado por cliente.
- [x] Transformar Percurso em acompanhamento vivo, corrigindo links, confiança, retomada, marcos e validação pelo cliente.

- [x] Separar relatórios semanais e mensais, entregá-los na conversa e arquivá-los no Percurso.
- [x] Elevar relatórios com evidências verificáveis, períodos fechados, síntese da AURA e correção pelo cliente; validar em clientes reais antes da publicação.
- [x] Unificar o pós-pagamento no app Olá Aura: confirmação, PIX, WhatsApp, e-mail, acesso e remoção de “Meu Espaço” da experiência visível.
- [x] Otimizar abertura e navegação do app e validar capacidade controlada em 50, 100, 200 e 300 acessos simultâneos (abertura e leitura autenticada; geração simultânea da AURA continua sendo uma capacidade separada).
- [x] Substituir Jornadas completas na conversa por cartões compactos que abrem diretamente o episódio no app.
