# Plano — PIX Automático Bacen/Inter 100%

## Objetivo
Fechar o fluxo completo do PIX Automático do Banco Inter com garantias contra cobrança perdida, duplicada ou órfã, e validá-lo com uma transação real de R$ 6,90 antes de trocar o gateway ativo.

## Diagnóstico confirmado
- O gateway ativo ainda é **Asaas**; o Inter permanece isolado para validação.
- Existem **0 mandatos e 0 cobranças Inter** na base. Os crons e a sonda respondem, mas ainda não houve prova real do percurso pagamento → autorização → acesso → renovação.
- A criação pode devolver um QR válido mesmo se falhar ao salvar o mandato ou a cobrança localmente.
- O webhook registra a deduplicação antes de garantir que o evento foi processado. Em algumas falhas, o evento fica bloqueado para sempre.
- Um ciclo pode ser marcado localmente como pago antes da confirmação remota; se a ativação falhar, a auditoria deixa de enxergá-lo como pendente.
- Retentativas que voltam com o mesmo status podem ser descartadas pela chave atual de deduplicação.
- O cancelamento tenta remover o QR inicial pela rota de cobrança recorrente, embora o ciclo 0 use outra rota; isso pode deixar um QR antigo ainda pagável.
- O cancelamento pelo portal procura o mandato usando o identificador incorreto do perfil.
- A troca de plano cancela o mandato anterior antes de garantir que o novo mandato/QR foi criado, deixando risco de interrupção sem retorno automático.
- A troca de plano aceita um `userId` enviado pelo cliente sem validar a identidade no backend.
- Não há testes automatizados do trilho Inter; hoje existem apenas `dry_run` operacionais.

## Fase 1 — Integridade financeira P0
1. Tornar a criação recuperável e consistente:
   - criar um registro local de tentativa antes das chamadas remotas;
   - persistir cada identificador remoto à medida que nasce;
   - nunca responder sucesso se mandato e cobrança não estiverem salvos;
   - compensar recursos remotos quando uma etapa posterior falhar;
   - reutilizar uma tentativa válida ao repetir o checkout, em vez de gerar mandatos paralelos.
2. Substituir a deduplicação “recebido” por estados `processing`, `processed` e `failed`, com tentativas, erro e timestamps.
3. Só concluir o evento depois de confirmação remota, atualização da cobrança e ativação do acesso; falha parcial permanece reprocessável.
4. Separar claramente no webhook:
   - evento recebido;
   - pagamento confirmado pelo Inter;
   - cobrança persistida;
   - acesso provisionado;
   - comunicação enviada.
5. Corrigir o cancelamento para usar `/cob` no ciclo 0 e `/cobr` nos demais, sem marcar localmente como cancelado quando a remoção remota falhar.
6. Corrigir o vínculo `profiles.id` versus `profiles.user_id` em cancelamento, troca e reautorização.
7. Validar a sessão/JWT no backend e derivar o usuário autenticado; nunca confiar em `userId` recebido do navegador.

## Fase 2 — Ciclos, retentativas e reconciliação P0/P1
1. Fazer o índice do ciclo avançar por calendário/estado do mandato, sem depender apenas da maior linha local.
2. Criar trava atômica por mandato+ciclo para runner e auditoria não emitirem simultaneamente.
3. Avançar `next_charge_date` somente depois da cobrança remota e da persistência local confirmadas.
4. Modelar cada retentativa separadamente, com número, data solicitada, resposta remota e próximo passo; não incrementar contador quando a API rejeitar a solicitação.
5. Tornar a deduplicação sensível à ocorrência real da retentativa, não apenas a `txid + status`.
6. Reconciliar cobranças abertas e liquidadas independentemente de `paid_at` local, consultando o Inter por janela e por mandato.
7. Paginar runner/auditoria além dos limites atuais e registrar backlog, duração, falhas e última execução saudável.
8. Corrigir a auditoria para ignorar `cycle_index` nulo ao calcular o próximo ciclo.
9. Tratar expiração, rejeição, cancelamento, remoção e liquidação tardia com uma máquina de estados explícita e transições permitidas.

## Fase 3 — Trial, acesso e datas P1
1. Unificar cálculo de datas em BRT para:
   - pagamento inicial;
   - sete dias promocionais;
   - primeiro débito mensal;
   - vencimentos em fim de mês e ano bissexto;
   - validade de acesso.
2. Eliminar qualquer lacuna entre os 7 dias pagos e o primeiro ciclo mensal.
3. Tornar a detecção de cliente retornante conservadora: falha de consulta não pode conceder novo trial silenciosamente.
4. Garantir que cada liquidação estenda o acesso exatamente uma vez, mesmo com webhook duplicado ou fora de ordem.
5. Não sobrescrever plano/gateway vigente por um QR ainda não pago.

## Fase 4 — Cancelamento, troca e reautorização P1
1. Cancelamento:
   - confirmar mandato remoto cancelado;
   - remover todas as cobranças abertas pela rota correta;
   - preservar acesso até a validade já paga;
   - reconciliar liquidação que chegue durante a corrida do cancelamento.
2. Troca de plano:
   - criar e validar o novo mandato antes de encerrar definitivamente o anterior, usando contrato novo quando necessário;
   - manter estado `pending_change` até o novo QR ser pago;
   - cancelar o novo mandato e preservar o antigo se a troca falhar;
   - impedir dois mandatos cobrando simultaneamente.
3. Reautorização:
   - token com validade e uso controlado;
   - reutilizar QR ainda válido;
   - impedir múltiplos mandatos paralelos por cliques repetidos;
   - status baseado em confirmação remota e não só na linha local.

## Fase 5 — Testes e ativação controlada
### Testes automatizados
Cobrir criação, compensação, webhook duplicado/fora de ordem, confirmação indisponível, ativação parcial, runner concorrente, três retentativas em sete dias, auditoria, cancelamento, troca e reautorização. Usar respostas simuladas do Inter e invariantes de banco.

### Teste real de R$ 6,90
Executar com um cliente interno e acompanhar:
```text
checkout → QR composto → pagamento → mandato aprovado
        → cobrança local concluída → perfil ativo → confirmação enviada
        → ciclo futuro agendado → cancelamento/remoção comprovados
```
Validar no Inter e na base: valor, txid, idRec, E2E, status, datas BRT, acesso, funil e comunicação.

### Ativação gradual
1. Manter `pix_gateway=asaas` durante as correções.
2. Fazer teste real isolado do Inter.
3. Liberar canário pequeno e monitorar por pelo menos um ciclo operacional.
4. Só então alterar o gateway padrão, com rollback imediato para Asaas se a saúde financeira falhar.

## Observabilidade e critério de “100%”
Adicionar painel/alertas para mandatos criados, aprovados, rejeitados e abandonados; cobranças emitidas, pagas, falhas e retentativas; eventos presos; divergência remoto×local; tempo até ativação; e crons atrasados.

O trilho estará pronto quando todos os cenários automatizados passarem, o teste real fechar sem intervenção manual, nenhuma divergência permanecer após a auditoria e cancelamento/troca forem confirmados remotamente.
