# Templates do trilho "copiou o código PIX" — texto novo e gerar código de novo

## 1. A mensagem de 20 min está burocrática — proposta nova

O problema do texto atual: começa explicando o que a gente viu (relatório), oferece suporte técnico antes de qualquer valor, e termina com instrução operacional. Parece robô de cobrança.

Direção: falar como pessoa, uma frase de valor concreto (o que já está reservado pra ela hoje), e uma pergunta simples. Sem "seu código continua valendo", sem tom de tutorial.

Sua observação está correta: "Tive um erro" / "Vou pagar agora" só cobre dois estados (falha técnica e intenção mantida). Quem ficou com dúvida, desconfiou do PIX Automático, achou o valor estranho ou quer entender o que recebe **não se enxerga em nenhum dos dois** e não clica em nada — e esse é justamente o grupo maior. Quick reply é a única porta que abre a janela de 24h; se não houver botão pra dúvida, a conversa nunca começa.

A Meta permite **3 quick replies** por template. Então usamos os três estados reais:

**"Tive um erro" / "Ficou uma dúvida" / "Vou pagar agora"**

Opção A (recomendada — leve, humana, com valor):
"{{1}}, seu acesso à Aura tá quase de pé aqui — faltou só concluir o PIX no app do banco. Se travou, se ficou alguma dúvida ou se você só quer entender melhor como funciona, me fala que eu te respondo agora. 💚"

Opção B (mais direta, foco no que acontece depois):
"{{1}}, faltou um passo pro seu PIX entrar. Assim que entrar, eu já te chamo aqui e a gente marca seu primeiro encontro guiado pra hoje à noite. Se travou algo ou ficou alguma dúvida, me diz que eu resolvo. 💚"

Por que isso muda a recuperação: o botão "Ficou uma dúvida" transforma desconfiança silenciosa em conversa — e é aí que o agente de recuperação (já reposicionado pra encantar, sem se diminuir) tem o melhor desempenho. Cada clique também vira motivo estruturado na tentativa, então passamos a saber quanto do abandono é erro bancário, quanto é dúvida e quanto é desistência real.

Observação de aprovação: categoria Utility, 1 variável ({{1}} = primeiro nome), texto curto, 3 quick replies — dentro do padrão que a Meta já aprovou nos outros templates da recuperação.


## 2. "Eu gero um novo código pra você" — dá pra cumprir? Sim.

Verificado no código: a criação do PIX Woovi (`criar-pix-recorrente-woovi`, `mode: "checkout"`) só precisa de nome, e-mail, telefone, plano e ciclo — e esses cinco campos já estão gravados na sessão de checkout do lead (`checkout_sessions`: name, email, phone, plan, billing). Então é possível gerar um código novo sem o lead preencher nada de novo, e o agente de recuperação já sabe enviar texto livre pelo WhatsApp quando a janela de 24h está aberta (ou seja, depois que ela responder/clicar num botão).

Como isso funciona na prática:

```text
lead copiou e não pagou
        │
   msg 20min (template aprovado)
        │
   ela clica "Tive um erro" / responde  → janela de 24h abre
        │
   agente gera cobrança nova na hora e manda o copia-e-cola em texto
```

Limite honesto: se ela **não** responder, a janela de 24h fica fechada e não é possível mandar um código novo em texto — template não carrega código dinâmico longo. Por isso a msg de 2h deve ser um convite a responder, e o código novo sai imediatamente após a resposta.

Texto sugerido para a de 2h (template, sem código dentro):
"{{1}}, seu lugar na Aura ainda tá reservado. Se o código expirou ou apareceu 'tente mais tarde', responde aqui que eu gero um novo agora mesmo. 💚"

Botões: "Gerar novo código" / "Tenho uma dúvida" / "Já paguei"

## Detalhes técnicos

- Nova capacidade no `recovery-agent`: ao receber "Tive um erro"/"Gerar novo código" (ou intenção equivalente no texto), ele lê a sessão de checkout do telefone, chama `criar-pix-recorrente-woovi` em `mode: "checkout"` com os dados já salvos, e responde com o copia-e-cola + uma linha de instrução. Guarda de "já pagou" ao vivo (Woovi) antes de gerar, para não emitir cobrança em cima de pagamento concluído.
- Idempotência: no máximo uma geração nova por lead por janela de conversa; reuso da cobrança existente se ela ainda estiver válida.
- Nada disso liga o trilho: os disparos de 20min/2h continuam travados até os ContentSids aprovados serem cadastrados em `system_config.wa_copiou_templates` (m1/m2). Validação por dry-run antes do primeiro envio real.
- Sem envio real em teste, conforme a regra já vigente.
