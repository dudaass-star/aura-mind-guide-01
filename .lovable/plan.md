# Correção do acompanhamento das mensalidades PIX Woovi

## Diagnóstico confirmado agora

- As cobranças **estão sendo criadas na Woovi**. O problema não é uma desativação geral do PIX Automático nem falta de autorização dos clientes analisados.
- Nos dados locais, as coortes de entrada de R$ 6,90 estão assim:
  - **04/09:** 14 entradas e 10 mandatos válidos. Dos 5 que apareciam sem mensalidade no controle local, **2 parcelas estão marcadas como pagas na área de assinaturas da Woovi, mas não aparecem no extrato financeiro** (Iara e Ingrid), **2 têm nova tentativa solicitada** (Andreia e Francisco) e **1 teve falta de saldo confirmada** (Rosih).
  - **05/09:** 11 entradas e 9 mandatos válidos. Dos 9 que apareciam sem mensalidade localmente, **7 parcelas estão marcadas como pagas na área de assinaturas da Woovi, mas não aparecem no extrato financeiro** (Erica, Juliana, Kelli, Lara, Monica, Nilzete e Renata) e **2 têm nova tentativa solicitada** (Daiane e Keli).
  - **06/09:** 5 entradas, 4 mandatos válidos, 2 mensalidades reconhecidas e 3 ainda em acompanhamento.
- Há uma divergência dentro da própria Woovi: as nove parcelas têm `PAID/CONCLUDED`, data de pagamento e identificador bancário na API de assinaturas, mas o extrato financeiro da mesma API retorna apenas quatro mensalidades de R$ 29,90 nos últimos 12 dias. Portanto, **ainda não é seguro considerar as nove como dinheiro recebido**. É preciso conciliar cada identificador bancário com uma transação financeira antes de reconhecer receita ou liberar acesso.
- Entre os realmente não pagos, há dois estados comprovados:
  - **Rosih:** tentativa rejeitada por `EXPR`, que na documentação da Woovi significa falta de saldo na conta do pagador;
  - **Andreia, Francisco, Daiane e Keli:** nova tentativa `REQUESTED`, já encaminhada ao banco para execução na janela seguinte.
- A causa técnica local também foi confirmada: a auditoria tenta consultar como cobrança real os registros internos de tentativa, cujo identificador possui sufixos como `:cycle_retry:` e `:next_cycle_cobr:`. A Woovi responde repetidamente **“Cobrança não encontrada”**. Isso desperdiça chamadas, causa demora/limite de taxa e impede que a reconciliação alcance todos os clientes dentro da execução.
- Os agendamentos estão ativos: auditoria completa a cada 15 minutos e leitura do extrato a cada 10 minutos. O problema está na forma de reconciliar e classificar os resultados, não na ausência dessas rotinas.

## O que será corrigido

1. **Separar tentativa interna de cobrança real**
   - A auditoria deixará de consultar na Woovi os registros `recovery_attempt` com identificador sintético.
   - Somente IDs reais de parcela/cobrança serão enviados aos endpoints de consulta.

2. **Usar a assinatura e suas parcelas como fonte principal**
   - Para cada mandato vencido, consultar a lista real de parcelas da assinatura.
   - Usar `COMPLETED/CONCLUDED/PAID` como sinal operacional de que o banco concluiu a tentativa, mas só reconhecer financeiramente após localizar o mesmo identificador bancário no extrato ou receber confirmação inequívoca da Woovi.
   - Colocar parcelas pagas sem transação correspondente em estado explícito de `divergência Woovi`, sem nova cobrança e sem contabilizá-las como receita.
   - Atualizar o próximo vencimento e encerrar tarefas de recuperação quando o pagamento já estiver confirmado.

3. **Classificar corretamente cada cliente**
   - `pago na Woovi e ainda não sincronizado`;
   - `rejeitado por falta de saldo (EXPR)`;
   - `rejeitado por outro código bancário`;
   - `nova tentativa solicitada, aguardando banco`;
   - `sem parcela ou cobrança real`;
   - `Woovi indisponível/limite de taxa, aguardando nova leitura`.

4. **Preservar a régua sem duplicar débitos**
   - Nunca criar nova cobrança quando a parcela já possui uma CobR ativa ou uma tentativa `REQUESTED`.
   - Manter as novas tentativas permitidas pela Woovi e o teto de recuperação já definido, sem antecipar cobranças fora da janela permitida.
   - Só iniciar comunicação de falha após um veredito real; não tratar atraso de sincronização como inadimplência.

5. **Reconciliar as coortes afetadas**
   - Reprocessar 04/09, 05/09 e 06/09 após a correção.
   - Conciliar os nove `PAID/CONCLUDED` com o extrato pelo `endToEndId`, valor e data; importar somente os que tiverem transação financeira correspondente.
   - Gerar a relação objetiva dos casos ainda divergentes para cobrança técnica à Woovi, sem repetir débito no cliente.
   - Deixar em acompanhamento apenas quem realmente não pagou ou ainda aguarda resposta bancária.

## Validação final

- Comparar, cliente por cliente, entrada, mandato, parcela, tentativa bancária, pagamento, próximo ciclo e acesso, começando pelos 5 casos de 04/09 e 9 casos de 05/09 já classificados acima.
- Confirmar que nenhuma parcela paga permanece como pendente.
- Confirmar que nenhum cliente com tentativa em andamento recebe cobrança duplicada.
- Confirmar que erros “Cobrança não encontrada” deixaram de ser gerados pelos IDs sintéticos.
- Entregar o quadro final das três coortes com totais reais: pagos, falta de saldo, aguardando banco, outras recusas e pendências técnicas.

## Arquivos envolvidos

- `supabase/functions/woovi-pix-audit/index.ts`
- `supabase/functions/execute-scheduled-tasks/index.ts`
- `supabase/functions/_shared/woovi.ts`
- Testes específicos do fluxo de cobrança e reconciliação Woovi
