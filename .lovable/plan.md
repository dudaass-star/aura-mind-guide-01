# "Tente mais tarde" no PIX: o que os dados mostram e como parar de ficar cego

## O que já está confirmado

Nos últimos 21 dias, 140 autorizações de PIX Automático foram criadas e **apenas 46 foram aprovadas (33%)**.

Sobre as 96 "rejeições" registradas: elas **não são recusas do banco**. Comparando a hora de cada evento com a hora da criação:

- aprovações chegam em média **2 minutos** depois (46 das 47 em menos de 10 min);
- rejeições chegam em média **36 horas** depois — ou seja, são o QR de 24h expirando sem ninguém concluir. Só **1** rejeição em 21 dias chegou rápido o suficiente para ser recusa real.

E o caso da Luiza: o QR dela foi gerado e copiado, mas **não existe nenhum evento** do provedor para ela — nem aprovação, nem rejeição. A falha que ela viu aconteceu dentro do app do banco e **não deixou rastro nenhum do nosso lado**.

Conclusão dura: entre "copiei o código" e "mandato aprovado" existe um vão de aproximadamente **2 em cada 3 tentativas** onde não temos absolutamente nenhum dado. Hoje é impossível distinguir "desistiu" de "tentou e o banco deu erro". Não dá para afirmar quantos são erro — dá para afirmar que estamos cegos nesse trecho, e que a Luiza é a prova de que existe erro ali.

Dois agravantes já visíveis nos dados:

- `payer_bank` está vazio em 83 dos casos que não concluíram — não sabemos nem em qual banco a tentativa aconteceu, então não conseguimos ver se um banco específico concentra a falha;
- o fluxo em uso é composto (entrada da 1ª semana + autorização das mensalidades), e em vários bancos isso aparece em duas telas separadas — mais superfície para erro do que a jornada nativa.

## O que fazer

1. **Enxergar o vão.** Consultar ativamente o status do mandato no provedor durante as primeiras horas após a geração do QR (por exemplo aos 3, 10, 30, 60 e 120 minutos) e gravar cada transição de status com o horário, o banco pagador e qualquer código/mensagem de erro retornado. Hoje só existe reação passiva a webhook — se o webhook não vem, nada acontece e o caso morre em silêncio.
2. **Preencher sempre o banco pagador.** Registrar a instituição em toda tentativa, aprovada ou não. Sem esse campo é impossível descobrir se "tente mais tarde" é de um banco específico (e, se for, tratar aquele banco de forma diferente).
3. **Perguntar a quem travou.** Alguns minutos depois do QR sem conclusão, mandar uma pergunta curta e objetiva no WhatsApp com opções de resposta: apareceu erro no app do banco / o banco não encontrou a autorização / ainda não tentei / desisti. A resposta vira campo estruturado no registro da tentativa. Isso converte o silêncio de 57% em diagnóstico real, e ainda recupera venda.
4. **Consultar o provedor sobre os casos concretos.** Levantar (por leitura de API e, se necessário, pelo suporte do provedor) se existe motivo de recusa disponível para essas tentativas e se há incidente conhecido de "tente mais tarde" no fluxo de autorização — comparando a taxa de conclusão da jornada composta com a da jornada nativa nos nossos próprios números.
5. **Não deixar o lead na mão quando trava.** Para quem tentou e não conseguiu autorizar, oferecer caminho alternativo imediato em vez de só reenviar o mesmo QR: nova autorização gerada na hora e, se falhar de novo, PIX simples da 1ª semana com a autorização das mensalidades feita em seguida.
6. **Painel com a verdade do funil.** No admin, separar por dia: QR gerado, autorização aprovada, entrada paga, expirado sem tentativa, tentou e falhou (a partir dos itens 1 e 3). Hoje o painel mistura expiração com recusa e a leitura fica errada.

## Detalhes técnicos

- Polling: nova função agendada lendo `woovi_subscriptions` com `pix_status='CREATED'` e criação recente, consultando o mandato na Woovi e gravando transições em uma tabela de eventos por tentativa (`status`, `payer_bank`, `raw`, `observed_at`), sem alterar as regras de concessão de acesso.
- O `pix_status='REJECTED'` gravado hoje pela auditoria por expiração precisa de rótulo próprio (expirado ≠ recusado) para os relatórios pararem de somar as duas coisas.
- Pergunta de diagnóstico: reutilizar a infraestrutura de recuperação já existente (template curto + captura da resposta), gravando o motivo no registro da tentativa.
- Nada aqui exige mudar o gateway nem o checkout: primeiro instrumentar e medir, depois decidir se a jornada composta sai.
