# Project Memory — entradas novas

## Memories
- [Primeira sessão sem onboarding faseado](mem://features/sessions/primeira-sessao-sem-onboarding-faseado) — Roteiro de 5 fases removido em 27/08/2026 (loop de foco, 1ª sessão 4,47 vs 4,80); condução normal + nota curta factual
- [Vitrine de valor em 3 níveis](mem://features/recovery/value-showcase-tiers) — recovery-agent: memória/conveniência são nível C (nunca vendem); cenas de desejo (encontro 45min, meditações, jornadas) são a escolha padrão
- [Relógio como sinal, não condutor](mem://features/sessions/relogio-como-sinal-nao-condutor) — Proibido citar minutos; costura (dur+15), aterrissagem com consentimento, teto 2x duração; cron só encerra com silêncio real de 15min
- [recovery-agent sempre responde](mem://features/recovery/recovery-agent-sempre-responde) — Cliente ativo vira modo SUPORTE, madrugada entra em fila (cron 08h05 BRT), cota 8, anexo e "ok" respondidos; nada de skip silencioso
- [Trilho copiou o código PIX](mem://features/recovery/trilho-copiou-codigo-pix) — Régua única: copiou → 20min/2h no lugar do genérico 15min; gate por ContentSid em system_config.wa_copiou_templates; dryRun valida sem enviar

- [recovery-agent nunca se diminui](mem://features/recovery/nunca-se-diminuir) — Proibido abrir por negação ou se comparar por baixo com terapia; identidade exige cena nível A; cenas A elevadas ao padrão "quero isso agora"
- [recovery-agent nunca adivinha a dúvida](mem://features/recovery/duvida-em-branco) — "Ficou uma dúvida" sem conteúdo = UMA pergunta curta; sem vitrine, PIX, valores, link ou taster
- [Estágio 24h da recuperação WhatsApp](mem://features/recovery/checkout-wa-stage2-sid) — ContentSid 24h correto (34 chars), trava de 3 falhas por estágio contra loop do cron de 5min, debug-recovery-template com list_contents
- [Cap não pune engajamento](mem://features/recovery/cap-nao-pune-engajamento) — Cap 30d conta só templates (limite 3), conversa ativa 48h pausa sem fechar estágio, falha de infra não esgota lead, irmãos de telefone só em 6h


- [PIX só quando perguntado, link é exceção](mem://features/recovery/pix-so-quando-perguntado-e-link-excecao) — Agente de recuperação para de explicar PIX Automático sem pergunta e só manda o link do checkout sob condição
- [Madrugada reativa e dúvida em branco](mem://features/recovery/madrugada-reativa-e-duvida-em-branco) — Quiet hours não bloqueia inbound reativo; blankDoubt/shortAck avaliados sobre todos os inbounds desde o último outbound

