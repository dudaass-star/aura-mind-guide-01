# Ligar a oferta de R$ 6,90 — o caso da Luiza

Você está certo: a Luiza é exatamente o alvo da carta na manga. Ela gerou o PIX e **copiou o código duas vezes** (30/08 e hoje, 02/09, plano Essencial mensal) e não concluiu. Em vez de oferecer o encontro avulso, o agente ficou explicando o semanal de R$ 6,90 com autorização automática — justamente a trava dela.

## Por que ela não recebeu a oferta

Não é falta de código nem de template. Está tudo pronto:
- Template m3 aprovado pela Meta (`oferta_sessao_45min_unica`), SID já registrado.
- Elegibilidade, cobrança avulsa Woovi, botões, perfil taster, expiração em 48h — implementados.

O que bloqueia é **um único interruptor**: `taster_enabled` está `false`. Com ele desligado, a elegibilidade devolve "desligado_por_config" para todo mundo (menos o seu número de teste), então nem a Porta A (conversa) nem a Porta B (template m3) rodam. A Luiza passaria em todas as outras travas: não é cliente, nunca pagou, tem rastro de PIX copiado nos últimos 30 dias.

## O que fazer

1. **Ligar o kill switch** `system_config.taster_enabled = true`.
2. **Falar com a Luiza agora**, manualmente, pelo inbox de recuperação: ela está com a janela de 24h aberta, então o agente pode oferecer o encontro em texto livre e gerar o código de R$ 6,90 na hora.
3. **Deixar o trilho rodar sozinho** a partir daí:
   - Porta A: quem responde e trava em "não quero autorizar cobrança automática" recebe a oferta na conversa (uma vez por lead).
   - Porta B: quem copiou, recebeu m1 e m2 e não respondeu recebe o template m3 24h depois, com botões "Quero experimentar" / "Tenho uma dúvida".
4. **Acompanhar os 3 primeiros pagos** ponta a ponta: código → pagamento → perfil taster → agendamento com a Aura no número oficial → encontro → convite ao plano → expiração.

## Ponto de decisão

O teste ponta a ponta com o seu número parou porque você é cliente ativo — a trava certa disparou. Ou ligamos com validação em produção nos primeiros leads reais (o que já dá para acompanhar de perto pelo painel), ou uso um número de teste sem perfil para fechar o ciclo antes.

## Detalhes técnicos

- Alteração de dados: `system_config.taster_enabled` para `true`. Nenhuma mudança de código necessária.
- Guardas que continuam valendo: cliente ativo/trial/dunning/ex-pagante bloqueados, 1 oferta por telefone com cooldown de 180 dias, 1 código por hora, cobrança `/api/v1/charge` avulsa (sem mandato), cap de 30 dias por telefone, silêncio 22h–08h BRT.
- Reversão: voltar o mesmo campo para `false` desliga as duas portas na hora.
