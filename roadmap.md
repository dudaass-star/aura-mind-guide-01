# Roadmap

- [x] Painel semanal do funil Taster no admin (TasterFunnelPanel em AdminWhatsappRecovery)
- [x] Antecipar convite m3 de ~48h para ~6h, âncora em wa_copiou_2h_sent_at (trilho separado do genérico)
- [x] Porta B: bloquear só inbound recente (<24h) ou oferta já existente — conversa fria volta a receber convite
- [x] Lembretes do código não pago (+45min e manhã seguinte 09h BRT) via execute-scheduled-tasks, cancelados no pagamento (webhook-woovi → cancelTasterReminders)
- [x] Painel separado de disparos de cobrança com filtros, pessoas distintas, status de entrega e ofertas aceitas

Tudo concluído em 10/09/2026. Funções publicadas; painel de cobrança separado da recuperação de checkout e retorno real de entrega ativado.
- [x] Remover silêncio do recovery-agent ao atingir limite, preservando pausas explícitas
- [ ] Validar suporte a cliente ativo após 8 respostas e responder a pergunta pendente
