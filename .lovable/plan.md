# Painel de recuperação de checkout: deixar a leitura 100% honesta

## Respondendo direto às suas perguntas

Conferi no banco as linhas exatas da sua tela (Angélica, Amanda, Jilvania, Rita, Gabriela, Drica, Jacqueline, Milena, Adriana). Todas têm o mesmo perfil: **nenhum e-mail enviado, nenhum WhatsApp enviado, nenhum registro de tentativa — e já pagaram.**

- **"Legado"** é o rótulo que sobra quando não existe nenhum registro nem data de envio de e-mail. Nessas linhas ele quer dizer, na prática, "nada foi enviado".
- **WhatsApp "—"**: correto, nada foi disparado.
- **Então por que aparecem aqui?** Por um efeito colateral: quando a pessoa escolhe PIX, o sistema marca internamente uma flag para **impedir** que o carrinho abandonado (desenhado para cartão) mande e-mail. A tabela usa essa mesma flag como critério de "entrou na recuperação". Resultado: todo checkout PIX entra na lista. São 957 sessões com essa flag hoje, e as últimas 50 (que é o que a tabela mostra) são quase todas PIX pago.
- Elas não estão contando como recuperação — estão como "Voltou sozinha". Mas não deveriam nem aparecer.

## O que mais está pela metade (verifiquei no banco)

1. **Os números do cabeçalho olham universos diferentes.** "0 recuperadas · 26 voltaram sozinhas · 20 não voltaram" é calculado só sobre as 50 linhas mais recentes da tabela; a linha do WhatsApp acima diz "53 recuperadas pelo WhatsApp" olhando a base inteira. Daí a sensação de contradição.
2. **"902 em 15min" e "889 em 24h" estão inflados.** De 902 linhas com data de 15min, **326 foram puladas, não enviadas** — o fluxo grava a data mesmo quando pula, só para não reavaliar. O mesmo no e-mail: de 905 com data de estágio 1, 116 são pulos.
3. **"53 recuperadas pelo WhatsApp" herda o mesmo erro**: usa a data de envio mesmo quando o envio foi pulado, então credita ao WhatsApp gente que nunca recebeu mensagem.
4. **"956 tentativas brutas"** é o total da flag de PIX, não de e-mails enviados.
5. **"0 erros de entrega"** é o único número que já está correto hoje.

## O que muda no painel

Arquivo único: `src/pages/AdminEngagement.tsx`.

1. **Quem entra na tabela**: só sessões com atividade real de recuperação — data de e-mail (1/2/3), data de WhatsApp (15min/24h), erro/pulo de WhatsApp, ou registro de tentativa. A flag de PIX deixa de valer como entrada.
2. **"Legado" desaparece**. A coluna de e-mail passa a ter só: enviado (1/3, 2/3, 3/3), falhou, pulado com motivo, ou "—" quando a linha entrou pelo WhatsApp e nunca teve e-mail.
3. **Enviado ≠ pulado em todos os contadores**: as datas de envio só contam como envio quando o registro de tentativa correspondente for `sent`. Cabeçalho passa a mostrar "enviados" e "pulados" separados, para e-mail e para WhatsApp.
4. **Um único universo nos números de resultado**: recuperadas / voltaram sozinhas / não voltaram passam a ser calculadas sobre toda a base de recuperação (como já é feito no card do WhatsApp), não só sobre as 50 linhas visíveis. A tabela continua mostrando as mais recentes, com a contagem total no cabeçalho.
5. **"Recuperadas pelo WhatsApp"** passa a exigir envio de verdade antes do pagamento (ignora datas de pulo).
6. **"Tentativas brutas"** passa a contar e-mails de recuperação efetivamente enviados.
7. **Legenda curta** no card explicando em uma linha: recuperada = pagou depois de um contato que saiu; voltou sozinha = pagou antes de qualquer contato; pulado = trava de segurança, não falha.

## Detalhes técnicos

- `fetchRecoverySessions`: substituir o `.or('recovery_sent.eq.true,...')` por filtro em `recovery_stage{1,2,3}_sent_at`, `whatsapp_recovery_{15min,24h}_sent_at`, `whatsapp_recovery_last_error`.
- Contadores de estágio: em vez de `count(*) not is null` nas colunas de data, cruzar com `checkout_recovery_attempts.status` (`stage_N_sent` / `wa_stage_N_sent` vs `*_skipped`), ou excluir linhas cujo `*_last_error like 'skipped:%'` no estágio mais recente.
- Blocos de resultado (recuperadas/organic/não voltou): mover o cálculo para a mesma consulta ampla já usada em `allWaSessions`, estendida com as colunas de e-mail, e expor totais no state.
- `recoveryStats.raw`: contar envios de e-mail em vez de `recovery_sent = true`.
- Badge de e-mail: remover o fallback `Legado`.
- Sem migração, sem edge function, sem redeploy — só leitura e apresentação.
