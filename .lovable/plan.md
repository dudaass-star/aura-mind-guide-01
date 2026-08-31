# Templates do PIX copiado — por que a Meta recusou e o que corrigir

## O que aconteceu (motivo real, consultado na Twilio)

Sim: cinza = em aprovação, vermelho = recusado. O `recuperacao_pix_copiaecola_2hs2` voltou como **rejected** com esta razão exata da Meta:

> "Variables can't be at the start or end of the template." (code 100, subCode 2388299)

Ou seja: **não é o texto nem a categoria** — é o fato de a mensagem **começar com `{{1}}`**. A Meta não aceita variável na primeira nem na última posição do corpo. Todos os textos que rascunhamos começam com "{{1}}, ..." — então os dois templates vão ser recusados pelo mesmo motivo até isso mudar.

Segundo ponto encontrado na mesma consulta: o template foi criado como **`twilio/text`**, que **não suporta botões**. Sem quick reply, ninguém abre a janela de 24h e o trilho perde o efeito. Precisa ser criado como **quick-reply** (Content Type "Quick reply" na Twilio), não "Text".

## Textos corrigidos (variável no meio da frase)

**m1 — 20 min** (nome: `recuperacao_pix_copiado_20min`)

"Oi {{1}}, seu acesso à Aura tá quase de pé — faltou só concluir o PIX no app do banco. Se travou, se ficou alguma dúvida ou se você quer entender melhor como funciona, me responde aqui que eu resolvo com você agora."

Botões (quick reply): "Tive um erro" / "Ficou uma dúvida" / "Vou pagar agora"

**m2 — 2 h** (nome: `recuperacao_pix_copiado_2h`)

"Oi {{1}}, seu lugar na Aura continua reservado. Se o código PIX expirou ou apareceu 'tente mais tarde', me responde aqui que eu gero um novo pra você na hora."

Botões (quick reply): "Gerar novo código" / "Tenho uma dúvida" / "Já paguei"

Ambos começam com "Oi {{1}}" (variável na 2ª posição, válido) e terminam em texto — sem emoji final, sem variável na ponta. Categoria: **Utility** (não Marketing: é continuação de uma transação que a pessoa iniciou; Utility aprova mais fácil e não conta como marketing).

## Sobre os 3 botões (sua observação anterior, mantida)

Só "Tive um erro" / "Vou pagar agora" deixa de fora quem ficou com dúvida ou desconfiou — e esse é o grupo maior, que simplesmente não clica. O terceiro botão de dúvida é o que transforma silêncio em conversa, e cada clique vira motivo estruturado (erro bancário x dúvida x desistência).

## "Eu gero um novo código" — dá pra cumprir? Sim

A criação do PIX Woovi (`criar-pix-recorrente-woovi`, `mode: "checkout"`) só precisa de nome, e-mail, telefone, plano e ciclo, e os cinco já estão gravados em `checkout_sessions`. Depois que a pessoa clica em qualquer botão, a janela de 24h abre e o agente pode mandar o copia-e-cola novo em texto livre. Se ela não clicar em nada, não há como enviar código novo (template não carrega código dinâmico longo) — por isso a m2 é convite a responder, não entrega de código.

## Detalhes técnicos

- Recriar os dois templates na subconta de recuperação como **quick-reply**, categoria Utility, `pt_BR`, com "Oi {{1}}" e sample preenchido, e submeter à aprovação.
- Nova capacidade no `recovery-agent`: ao receber "Tive um erro"/"Gerar novo código" (ou intenção equivalente), busca a sessão de checkout pelo telefone, checa ao vivo na Woovi se já pagou, gera cobrança nova e responde com o copia-e-cola. Máximo de uma geração por janela de conversa; reusa a cobrança existente se ainda válida.
- Botão "Ficou uma dúvida"/"Tenho uma dúvida" cai no agente já reposicionado (encanta, não se diminui) e grava o motivo na tentativa.
- Trilho continua **desligado** até os ContentSids aprovados entrarem em `system_config.wa_copiou_templates` (m1/m2). Validação por `dryRun` antes do primeiro envio real. Nenhum envio real em teste.
