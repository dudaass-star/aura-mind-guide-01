# PIX mensal — situação de hoje (10/09/2026)

## O dinheiro que entrou hoje é de ontem

| Pessoa | Plano | Valor | Venceu | Caiu |
|---|---|---|---|---|
| Regina Coeli | Direção | R$ 49,90 | 09/09 | 10/09 |
| Gisele Pavan | Essencial | R$ 29,90 | 09/09 | 10/09 |

As duas eram exatamente os dois casos de ontem que estavam com mandato vivo e sem
ordem de débito. A ordem foi criada ontem por volta das 11h30, fora da janela em que
a Woovi executa os débitos do dia — por isso a execução caiu na madrugada seguinte e o
dinheiro apareceu hoje. Ou seja: ontem "faltavam" duas cobranças, hoje as duas entraram.
Nada ficou pendente do dia 09.

Também aparece antes disso, no dia 09, a Maria (R$ 29,90) — essa era parcela vencida em
07/09, paga com dois dias de atraso, e o Geraldo (R$ 49,90), vencido e pago no mesmo dia 09.

## O que vence hoje (10/09)

Só duas pessoas, e nenhuma delas é cobrável por PIX Automático:

- **Rosane Moreira Cerqueira** (R$ 29,90) — o banco derrubou a autorização (mandato
  recusado). Não existe débito possível; caso é de recuperação por conversa.
- **Marcia Dias** (R$ 29,90) — pagou a entrada de R$ 6,90, mas **a autorização nunca foi
  aprovada** (sem data de aprovação). Mesmo assim o cadastro dela está marcado como
  "ativa", e a tentativa de hoje voltou recusada pela Woovi (erro 400). É o único caso
  realmente errado do dia.

## Vencidos anteriores sem nenhum mensal pago

São 25 pessoas desde 21/08. Vinte e uma já estão canceladas ou com autorização derrubada.
Nenhuma delas está com acesso válido: a validade de todas expirou na data do vencimento.
O que incomoda é o rótulo — várias mostram "ativa" no cadastro mesmo com validade vencida
e mandato morto, o que faz qualquer contagem parecer pior (ou melhor) do que é.

## Régua de cobrança em pé

8 reconferências de tentativa, 8 criações de próxima parcela, 14 aberturas de recuperação
e 2 avisos finais estão na fila, todos agendados. A régua está rodando.

## O que eu proponho corrigir

1. **Marcia Dias**: conferir na Woovi o estado real da autorização. Se estiver mesmo sem
   aprovação, parar de tentar débito nela e mandá-la para a régua de recuperação por
   conversa (autorizar de novo ou pagar de outra forma), em vez de bater no erro 400.
2. **Rótulo honesto de status**: mandato que nunca foi aprovado não deve ficar como
   "ATIVA". Hoje são 8 nesse estado — e 4 deles com mensal já vencida ou a vencer
   sendo tentada à toa (Carlos, Renato Vito, Marcia Dias, VANESSA Silva); outros 4
   (Mariana Oliveira, Cleide, Gleicy, Vanessa Scian) nem entrada pagaram. Alinhar o
   status com o que a Woovi diz, para que os painéis e as contagens parem de misturar
   quem pode ser cobrado com quem não pode.
5. **Separação visível das duas trilhas de R$ 6,90**: sessão única (Taster — 1 paga até
   hoje, Sandra Macedo) e entrada de assinatura com PIX Automático são coisas
   diferentes; garantir no painel/relatórios que as duas trilhas aparecem separadas,
   junto com o recorte de mandatos recusados/sem aprovação (148 recusados sem nunca
   aprovar, 19 aprovados que caíram, 9 aguardando).
3. **Horário da criação da ordem**: passar a criar a ordem do ciclo com pelo menos um dia
   de antecedência (e não na manhã do próprio vencimento), para o débito executar no dia
   do vencimento em vez de cair na madrugada seguinte.
4. **Fechamento do dia no painel**: no painel de PIX por dia, marcar explicitamente
   "executado na janela seguinte" para não parecer falha o que é só atraso de janela.

## Detalhes técnicos

- Marcia Dias: `woovi_subscriptions.subscription_id` com `mandate_approved_at IS NULL` e
  `status = 'ATIVA'`; `woovi_charges` do ciclo 10/09 em `COBR_REJECTED_400` /
  `RETRY_REJECTED_400`. Consultar `/api/v1/subscriptions/{globalID}`, aplicar
  `normalizeMandateStatus`, e — sem aprovação — cancelar as tarefas de débito
  (`woovi_next_cycle_cobr`, `woovi_retry_confirm`) e abrir `woovi_recovery_offer`.
- Guarda no criador de ciclo (`woovi-pix-audit` / `_shared/woovi.ts`): não emitir CobR
  quando `mandate_approved_at IS NULL`; registrar motivo em `last_error` e rotear para
  recuperação.
- Sincronização de status para todo mandato com `status IN ('ATIVA','APROVADA')` e
  `mandate_approved_at IS NULL`, em lote respeitando `MIN_INTERVAL_MS`.
- Antecedência: emitir a CobR do ciclo em D-2/D-1 (janela Bacen já permite 5 a 10 dias
  antes), nunca no próprio dia do vencimento.
- `PixAutomaticoDiaPanel`: nova situação "pago na janela seguinte" quando
  `paid_at::date > due_date` com diferença de 1 dia.
- Sem migração de banco. Deploy de `woovi-pix-audit` e do painel admin.
