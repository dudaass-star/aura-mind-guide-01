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

- [ ] Implementar entrada normal integrada: intenção segura, liberação pós-pagamento, área limitada, proteção de recursos e métricas
