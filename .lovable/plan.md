# Revisão geral do PIX Automático (Woovi) — do zero ao fim

Resposta curta à sua pergunta: **ainda não bateu tudo.** Os 8 pagamentos perdidos foram recuperados e a causa do "sem cobrança" foi corrigida, mas ao conferir agora:

- 78 mandatos vivos aqui (painel mostrava 73) — 5 de diferença por conferir.
- 25 mensalidades pagas nos últimos 30 dias, R$ 718,50 aqui; o painel mostrava 29 e R$ 1.342,20 (janelas podem ser diferentes, precisa bater linha a linha).
- 27 mandatos vivos com erro registrado e nunca reconferido.
- 12 mandatos vivos com data de cobrança já vencida.

Então sim: vale a revisão completa. O objetivo é sair daqui com **um único painel de verdade**: se a Woovi diz que existe, existe aqui; se entrou dinheiro, está registrado; se falhou, alguém (o sistema) age.

## O que a revisão vai cobrir

1. **Configuração da conta e do trilho**
   - Chave de acesso, webhooks cadastrados na Woovi (quais eventos, para qual endereço), e se todos os eventos que recebemos são tratados.
   - Limite de requisições da conta: quantas conferências rodamos por hora hoje e se cabe no limite (foi o que cegou as proteções).
   - Textos e valores que o cliente vê na tela do banco (descrição, valor de entrada, valor recorrente) por plano e ciclo.

2. **Campos e onde cada informação mora**
   - Mapa completo dos nossos registros de assinatura, cobrança e eventos: o que cada campo significa, quem o preenche, o que fica vazio hoje e não deveria.
   - Comparação campo a campo com o que a Woovi devolve (status do mandato, parcela, cobrança, vencimento, pagador) para eliminar leituras erradas como a da data de vencimento.

3. **Regras de negócio, escritas de forma explícita**
   - Entrada semanal → mensalidade no 8º dia; ciclos trimestral/semestral/anual.
   - O que acontece quando o banco recusa, quando o cliente desautoriza, quando paga atrasado, quando outra pessoa da família paga.
   - Quando o acesso é liberado, mantido e cortado; onde a recuperação silenciosa entra e onde a conversa com o cliente começa.

4. **Conferência linha a linha contra a Woovi**
   - Mandato por mandato: status, próxima cobrança e parcela agendada aqui vs. lá.
   - Pagamento por pagamento no extrato dos últimos 90 dias vs. nossos registros, com prova por identificador da transação.
   - Lista final de divergências separada em: dinheiro não registrado, cobrança que não existe na Woovi, status desalinhado, mandato morto ainda tratado como vivo.

5. **Correção e blindagem**
   - Corrigir cada divergência encontrada (registro de pagamento, criação de cobrança dentro da janela legal, alinhamento de status, encerramento de mandato morto).
   - Limpar os 27 erros pendentes: cada um vira "resolvido" ou "ação agendada", nenhum fica pendurado.
   - Fechar os 12 vencidos: cobrar, recuperar ou encerrar.
   - Conferência diária automática que compara os totais com a Woovi e conserta sozinha o que der para consertar.

6. **Entrega**
   - Um relatório em Arquivos com: números conferidos, divergências encontradas e resolvidas, regras do trilho por escrito e o que ficou dependendo da Woovi.
   - As decisões e o mapa de campos ficam registrados na memória do projeto, para não se perderem.

## Detalhes técnicos

- Leitura completa de `webhook-woovi`, `criar-pix-woovi`/`criar-pix-taster`, `woovi-pix-audit`, `execute-scheduled-tasks` (casos `woovi_*`), `_shared/woovi.ts` e `dunning-whatsapp.ts`, listando divergências entre contrato da API e nosso parsing.
- Inventário de `woovi_subscriptions`, `woovi_charges`, `woovi_webhook_events` e `scheduled_tasks` (`task_type` `woovi_*`): colunas usadas, colunas mortas, invariantes esperadas e consultas de checagem para cada invariante.
- Reconciliação: `/api/v1/subscriptions` paginado (status + `pixAutomatic`), `/api/v1/subscriptions/{id}/installments` (usando `dateGenerateCharge` e `cobr`) e `/api/v1/transaction` paginado em 90 dias, sempre com `dry_run` primeiro e orçamento de chamadas respeitando o 429.
- Correções aplicadas via `replayToWebhook` (fonte única de ativação) e `createInstallmentCobr` só na janela de 5–10 dias; nada de gravação direta de status de pagamento.
- Reconciliador diário de totais (mandatos vivos, cobranças agendadas, pagos do mês) com auto-correção; sem novos avisos ao admin, conforme sua preferência.
- Sem migração de banco prevista. Deploy apenas das funções que forem alteradas.
