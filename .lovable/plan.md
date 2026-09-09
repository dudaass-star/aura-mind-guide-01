# Painel de recuperação: tirar da tabela quem nunca entrou na recuperação

## O que os dados mostram

Consultei as linhas da sua captura (Angélica, Amanda, Jilvania, Rita, Gabriela, Drica, Jacqueline, Milena, Adriana). Todas têm o mesmo perfil:

- nenhuma data de envio de e-mail (estágio 0),
- nenhuma data de WhatsApp,
- nenhum registro de tentativa,
- e já estão pagas.

Ou seja: **nada foi enviado para elas e elas nunca estiveram na recuperação**. Elas aparecem na tabela por um efeito colateral: quando alguém escolhe PIX no checkout, o sistema marca internamente uma flag ("já tratado") só para impedir que o fluxo de carrinho abandonado — desenhado para cartão — mande e-mail para essa pessoa. A tabela do painel usa exatamente essa flag como critério de "entrou na recuperação". Resultado: todo checkout PIX entra na lista.

Isso explica as três coisas que você viu:

- **"Legado"**: é o rótulo que aparece quando não existe nenhum registro nem data de envio de e-mail. Nessas linhas ele é literalmente "não houve envio nenhum".
- **WhatsApp "—"**: certo, nada foi disparado.
- **"Voltou sozinha"**: a pessoa pagou, e como nenhum contato saiu antes, o painel não credita à recuperação. Só que ela nem deveria estar na lista — não foi um checkout abandonado, foi um checkout PIX normal que se completou.

Nas últimas 7 dias: 131 checkouts nesse recorte, 63 sem nenhum contato de recuperação.

## O que muda no painel

Arquivo único: `src/pages/AdminEngagement.tsx`.

1. **Critério de entrada na tabela** passa a ser atividade real de recuperação: existir data de e-mail (estágio 1, 2 ou 3), data de WhatsApp (15min/24h), erro/skip de WhatsApp, ou registro de tentativa. A flag interna de PIX deixa de valer como entrada. Com isso as linhas "Legado + — + Voltou sozinha" desaparecem.
2. **"Legado" sai da coluna de e-mail**. Passa a existir só dois casos: enviado (1/3, 2/3, 3/3), falhou, ou pulado com o motivo. Se a linha entrou por WhatsApp e nunca teve e-mail, a coluna mostra "—" em vez de "Legado".
3. **Contadores do cabeçalho** passam a contar o mesmo universo: "tentativas brutas" deixa de usar a flag de PIX e passa a contar sessões com data de e-mail de recuperação. Hoje esse número (956) está inflado pelos checkouts PIX.
4. **"Voltou sozinha"** continua existindo, mas agora só para quem realmente estava na recuperação e pagou antes do primeiro contato sair — que é o caso legítimo.

## Detalhes técnicos

- `fetchRecoverySessions`: trocar o `.or('recovery_sent.eq.true,...')` por um filtro em `recovery_stage1_sent_at`/`stage2`/`stage3`, `whatsapp_recovery_15min_sent_at`, `whatsapp_recovery_24h_sent_at`, `whatsapp_recovery_last_error`.
- `recoveryStats.raw`: contar `recovery_stage1_sent_at is not null` em vez de `recovery_sent = true`.
- Badge de e-mail: substituir o fallback `Legado` por `—` quando não há estágio nem attempt.
- Sem migração, sem edge function, sem redeploy — só leitura e apresentação.
