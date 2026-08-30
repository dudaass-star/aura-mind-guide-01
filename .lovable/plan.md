# Recuperação específica: copiou o código PIX e não concluiu

## Por que esse recorte

É o segmento de maior intenção do funil inteiro: a pessoa preencheu tudo, escolheu PIX, gerou o QR e **copiou o código para colar no banco**. Nos últimos 21 dias foram 141 cópias e só ~46 autorizações — a maior perda do funil está exatamente aí, e inclui casos de erro real (a Luiza copiou, o banco deu "tente mais tarde" e ninguém ficou sabendo). Merece tratamento próprio, não o template genérico de 15 min.

## Como identificar com precisão

Hoje o evento `pix_copy` do funil **não está ligado ao lead** (é anônimo, sem vínculo com o checkout). Primeiro passo técnico: o checkout passa a gravar o identificador da sessão de checkout nos eventos do fluxo PIX (`pix_qr_generated`, `pix_copy`), assim sabemos exatamente quem copiou, quando, e se concluiu.

## Regra de ouro: uma régua só, dois trilhos que nunca coexistem

Nada de fluxo novo rodando em paralelo com o atual. No momento em que o worker escolhe o que mandar para um lead, ele decide **um trilho e só um**, na mesma marcação de envio que já existe hoje:

```text
lead sem pagamento
      │
  copiou o código PIX?
      │
      ├── SIM ──► trilho "copiou": msg 20min ──► msg 2h (QR novo) ──► entra no 24h normal
      │
      └── NÃO ──► trilho atual: msg 15min ──────────────────────────► msg 24h normal
```

- O trilho "copiou" **substitui** a mensagem de 15 min — não soma. Quem entra nele fica com o 15 min marcado como enviado (motivo: trilho copiou), então o worker atual nunca dispara em cima.
- A partir de 24h os dois trilhos convergem para a mesma mensagem que já existe hoje. Ou seja: o total de mensagens por lead não aumenta — muda o conteúdo e o timing das primeiras.
- Um lead que copiou **depois** de já ter recebido o 15 min genérico não recebe a msg de 20 min (a janela já passou); vai direto para a de 2h com QR novo, se ainda estiver na janela.
- Os limites por telefone, o horário permitido, a checagem de "já pagou" ao vivo e o cap de falhas continuam valendo iguais, para os dois trilhos, no mesmo lugar do código.

## O fluxo do trilho "copiou"

1. **Mensagem 1 (~20 min após a cópia, sem autorização)** — curta e útil, não de vendas: "Oi Luiza, vi que você copiou o código do PIX — conseguiu concluir aí no app do banco? Se apareceu algum erro, me fala que eu resolvo agora." Com opções de resposta rápida (deu erro / não achei no banco / mudei de ideia). Se ela responder, o agente de recuperação já recebe o motivo no contexto e age: erro no banco → gera autorização nova na hora e orienta; não achou → explica onde fica (PIX Automático/Agendados); desistiu → conversa de valor normal.
2. **Mensagem 2 (~2h)** — QR/autorização novos gerados na hora (o código copiado pode ter expirado no app do banco) com frase de continuidade, não de cobrança.
3. **Se responder em qualquer ponto**, a régua automática pausa e o agente de recuperação assume a conversa — como já acontece hoje quando o lead responde.
4. **Guardas**: não dispara se pagou/ativou (checagem ao vivo no provedor, que já existe), se é cliente ativo, fora do horário permitido, ou se o telefone já bateu o limite.
5. **Métrica no admin**: taxa "copiou → autorizou" por dia e motivos de resposta (erro no banco / não achou / desistiu) — é o que finalmente vai separar abandono de falha técnica, e mostrar se algum banco concentra o "tente mais tarde".


## Detalhes técnicos

- Vínculo: `CheckoutV2` inclui o id da sessão de checkout no `meta` dos eventos PIX do funil; o worker de recuperação passa a ler esse vínculo para classificar o lead como "copiou".
- Mensagem 1: novo template no provedor de WhatsApp da recuperação (texto curto, 1 variável = nome), com quick replies; respostas capturadas pelo webhook já existente e gravadas como motivo estruturado.
- Mensagem 2: gera autorização nova chamando a função de criação PIX já existente (mesmo endpoint que o checkout usa) e envia o código copia-e-cola no texto.
- Prioridade sobre a régua atual: para esse grupo, o estágio de 15 min genérico é substituído (mesma marcação de envio, sem disparo duplo).
- Sem mudança de gateway, de preços ou de concessão de acesso.
