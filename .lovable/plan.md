# Recuperação específica: copiou o código PIX e não concluiu

## Por que esse recorte

É o segmento de maior intenção do funil inteiro: a pessoa preencheu tudo, escolheu PIX, gerou o QR e **copiou o código para colar no banco**. Nos últimos 21 dias foram 141 cópias e só ~46 autorizações — a maior perda do funil está exatamente aí, e inclui casos de erro real (a Luiza copiou, o banco deu "tente mais tarde" e ninguém ficou sabendo). Merece tratamento próprio, não o template genérico de 15 min.

## Como identificar com precisão

Hoje o evento `pix_copy` do funil **não está ligado ao lead** (é anônimo, sem vínculo com o checkout). Primeiro passo técnico: o checkout passa a gravar o identificador da sessão de checkout nos eventos do fluxo PIX (`pix_qr_generated`, `pix_copy`), assim sabemos exatamente quem copiou, quando, e se concluiu.

## O fluxo

```text
copiou o código ──► 20 min sem autorização ──► mensagem 1 (diagnóstico + ajuda)
                        │                             │
                        │                       respondeu? ──► recovery-agent assume com contexto
                        │                             │        ("deu erro no banco" / "não achei" /
                        │                             │         "desisti") e age conforme o motivo
                        ▼
                 ~2h sem conclusão ──► mensagem 2 com QR novo gerado na hora
                        ▼
                 24h ──► entra na régua normal de recuperação (como hoje)
```

1. **Mensagem 1 (~20 min após a cópia, sem autorização)** — curta e útil, não de vendas: "Oi Luiza, vi que você copiou o código do PIX — conseguiu concluir aí no app do banco? Se apareceu algum erro, me fala que eu resolvo agora." Com opções de resposta rápida (deu erro / não achei no banco / mudei de ideia). Se ela responder, o agente de recuperação já recebe o motivo no contexto e age: erro no banco → gera autorização nova na hora e orienta; não achou → explica onde fica (PIX Automático/Agendados); desistiu → conversa de valor normal.
2. **Mensagem 2 (~2h)** — QR/autorização novos gerados na hora (o código copiado pode ter expirado no app do banco) com frase de continuidade, não de cobrança.
3. **Integração com o que já existe**: quem copiou e não recebeu essas duas mensagens cai na régua normal (15 min / 24h) como fallback — a mensagem específica substitui a genérica de 15 min para esse grupo, não acumula.
4. **Guardas**: respeita as regras já existentes — não dispara se pagou/ativou (com a checagem ao vivo no provedor que já existe), se é cliente ativo, e dentro do horário permitido; a captura da resposta vira campo estruturado no registro da tentativa.
5. **Métrica no admin**: taxa "copiou → autorizou" por dia e motivos de resposta (erro no banco / não achou / desistiu) — é o que finalmente vai separar abandono de falha técnica, e mostrar se algum banco concentra o "tente mais tarde".

## Detalhes técnicos

- Vínculo: `CheckoutV2` inclui o id da sessão de checkout no `meta` dos eventos PIX do funil; o worker de recuperação passa a ler esse vínculo para classificar o lead como "copiou".
- Mensagem 1: novo template no provedor de WhatsApp da recuperação (texto curto, 1 variável = nome), com quick replies; respostas capturadas pelo webhook já existente e gravadas como motivo estruturado.
- Mensagem 2: gera autorização nova chamando a função de criação PIX já existente (mesmo endpoint que o checkout usa) e envia o código copia-e-cola no texto.
- Prioridade sobre a régua atual: para esse grupo, o estágio de 15 min genérico é substituído (mesma marcação de envio, sem disparo duplo).
- Sem mudança de gateway, de preços ou de concessão de acesso.
