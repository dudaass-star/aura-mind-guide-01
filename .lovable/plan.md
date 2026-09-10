# Lembretes do encontro de R$ 6,90 com voz humana

Hoje os dois lembretes soam como aviso de sistema: repetem preço, condições e link, sem perguntar nada de verdade. Vamos trocar por mensagens curtas de gente, no estilo que você descreveu.

## O nome do estilo

Chamamos de **Toque de Cuidado** (check-in humano): uma mensagem curta, em primeira pessoa, que abre com uma pergunta genuína sobre a pessoa — não com a oferta. A regra é: **pergunta primeiro, oferta só se ela pedir ou travar**.

Três princípios:
1. Abre perguntando, nunca reapresentando preço/condições.
2. Uma pergunta só, curta, sem parágrafo de venda.
3. O link volta apenas se a pessoa responder que travou ou pedir de novo.

## O que muda na prática

Primeiro toque (45 min depois de gerar o código):
> Oi, Fulano. Deu certo aí? Conseguiu fazer o PIX ou travou alguma coisa?

Segundo toque (manhã seguinte):
> Bom dia, Fulano. Fiquei pensando em você aqui. Deu pra experimentar a sessão guiada? Se tiver ficado alguma dúvida, me fala que eu resolvo.

Sem link colado por padrão, sem repetir "R$ 6,90, PIX comum, sem autorizar nada automático". Se a pessoa responder que perdeu o código ou travou, quem responde é o agente de recuperação, que já sabe reenviar o link.

## Detalhes técnicos

- `supabase/functions/execute-scheduled-tasks/index.ts`, case `taster_code_reminder`: substituir os dois textos pelas versões acima, usando o primeiro nome quando existir e uma variante neutra quando não existir. Remover a montagem obrigatória de `pageUrl` no corpo (manter a variável só para o caso de fallback do segundo toque quando a oferta não tem token, ou removê-la de vez).
- Manter intactas todas as travas atuais: cancela se `paid_at`, cancela se a janela de 24h estiver fechada, dedupe por `offer_id`, quiet hours e registro em `recovery_messages`.
- Publicar `execute-scheduled-tasks` e validar sem envio real (inspeção do texto gerado em log/dry-run).
- Salvar a regra como memória de estilo: lembretes e follow-ups seguem o Toque de Cuidado — pergunta genuína primeiro, oferta só sob pedido.
