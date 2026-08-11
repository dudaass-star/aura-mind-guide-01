# Pix Automático pelo Banco Inter — avaliação e caminho recomendado

## Resposta curta

Sim, dá pra fazer, e o Inter é um dos poucos que tem **API de Pix Automático oficial e documentada** (`developers.inter.co/references/pix-automatico`, com Pix Cob, CobV e Pix Automático no mesmo portal). Já ter a conta PJ lá ajuda: o cadastro sai por "Soluções para sua empresa → Nova Integração", que gera chave, secret e certificado.

Mas o Inter **não é o caminho mais rápido** pra destravar a venda de PIX. Ele é o mais barato e o mais nosso; a Woovi é a que coloca PIX recorrente de volta no ar em dias. São escolhas diferentes, não a mesma coisa mais barata.

## Comparação honesta

| | Banco Inter (direto) | Woovi (intermediador) |
|---|---|---|
| Pix Automático Bacen | Sim, API oficial | Sim, API oficial |
| O que a API entrega | A **especificação bruta do Bacen**: recorrência, solicitação de autorização, `cobr`, retentativa, estados do mandato | Abstração de **assinatura** pronta (`/subscriptions`, parcelas, retentativa 3R/7D configurável) |
| Quem constrói a lógica de assinatura | Nós: agendamento, geração de cobrança 2-10 dias antes, retentativas, ciclos, expiração | Woovi |
| Autenticação | OAuth client_credentials + **certificado mTLS** (arquivo que expira e precisa ser rotacionado) | Um AppID no header |
| Custo por transação | Muito baixo / tarifa de Pix da conta PJ | Tarifa do intermediador por cima |
| Esforço estimado | Alto — é reescrever o motor de cobrança recorrente | Baixo — é o mesmo shape do que já fizemos no Asaas |
| Risco técnico específico | mTLS dentro das nossas funções de backend precisa ser **provado antes** (o runtime só passou a suportar certificado de cliente recentemente; se não funcionar, o Inter fica inviável sem um proxy) | Nenhum — é HTTPS comum |

O ponto decisivo: no Inter a gente não recebe "assinatura", recebe o protocolo. Toda a máquina de estados que a Woovi (e o Asaas) já resolve — criar a `cobr` na janela de 2 a 10 dias antes, tratar rejeição imediata vs. expiração, escalonar retentativas, sustentar mandato revogado no app do banco — passa a ser código nosso, com dinheiro real em cima. É exatamente a superfície onde a gente já se queimou duas vezes (fatura gêmea, QR de 30 min, mandato órfão).

## Status atual: Woovi em análise cadastral (até 72h)

Isso muda a ordem, não a estratégia. Com a Woovi parada em análise e o Asaas bloqueado, **não existe trilho de PIX recorrente disponível hoje** — então as próximas 72h têm duas tarefas que não dependem de aprovação de ninguém:

1. **Proteger o checkout agora** (Fase 0-A): esconder o PIX enquanto nenhum trilho estiver saudável. Enquanto isso não estiver feito, todo cliente que escolhe PIX vira venda perdida silenciosa — é o furo mais caro em aberto.
2. **Provar o Inter em paralelo** (Fase 0-B): a integração no Internet Banking do Inter você cria sozinho, sem análise de terceiro. Se o mTLS funcionar no nosso runtime, o Inter deixa de ser "otimização futura" e passa a ser **plano B real** caso a Woovi seja recusada ou demore mais.

Em vez de esperar, a gente usa a janela pra descobrir se temos o Inter na mão. Se a Woovi aprovar em 72h, seguimos com ela (mais rápida) e o Inter continua sendo a economia futura, já com a dúvida técnica resolvida.

## Recomendação

**Duas etapas, não uma escolha.**

1. **Assim que a Woovi aprovar: Woovi**, pra parar de perder venda de PIX. É a mesma arquitetura que já existe no projeto, só troca o fornecedor.
2. **Depois (otimização de custo): Inter**, com o `pix_gateway` já preparado pra virar a chave. Só entra quando o volume de PIX justificar o esforço e depois de o mTLS ser provado.

Se você preferir ir direto pro Inter, eu faço — mas assumindo que o PIX recorrente fica fora do ar por mais tempo e que a responsabilidade pela cobrança recorrente passa a ser 100% nossa.

## Fase 0 — Prova de viabilidade do Inter (rápida, vale fazer de qualquer forma)

Antes de qualquer plano grande, três verificações:

1. Você cria a integração no Internet Banking do Inter (Nova Integração), com os escopos de **Pix Automático** e webhook, e baixa **certificado + chave + client_id/client_secret**.
2. Eu subo uma função `inter-probe` que só faz duas coisas: pega o token OAuth com mTLS e consulta um endpoint de leitura do Pix Automático. Isso responde a pergunta que ninguém responde na documentação: **o nosso runtime consegue apresentar certificado de cliente?**
3. Se sim, o Inter é viável e vira a Fase 3 (migração de custo). Se não, o Inter só entra com um proxy intermediário — e aí a economia deixa de compensar.

Essa fase é barata e resolve a dúvida com fato em vez de opinião.

## Fase 1 — PIX recorrente no ar pela Woovi

Como no plano anterior, sem mudança:

- `system_config.pix_gateway` (`woovi` | `inter` | `asaas`) como chave única de troca de trilho, no padrão do `card_gateway` que já existe no AdminSettings.
- `criar-pix-recorrente-woovi`: assinatura `PIX_RECURRING`, jornada `PAYMENT_ON_APPROVAL`, `retryPolicy: THREE_RETRIES_7_DAYS`, valor variável pra sustentar a **1ª semana a R$ 6,90 / 11,90 / 24,90** e depois `SUBSCRIPTION_VALUE_PUT` pro mensal cheio. Tri/Sem/Anual sem trial.
- `webhook-woovi`: trial pago ativa 7 dias; mandato aprovado agenda o valor cheio em D+7; `COBR_TRY_REJECTED` não é churn (janela de retentativa, dunning silenciado); `COBR_REJECTED` aciona o dunning PIX; mandato `REJECTED` cai no `/reautorizar-pix`. Dedupe por `correlationID` + parcela.
- `asaas-health-check` + PIX fora da UI quando o trilho estiver bloqueado, pra nunca mais gerar QR que não nasce.

## Fase 2 — Dunning, portal e auditoria

- `profiles.payment_rail` passa a conhecer `woovi_pix` (e depois `inter_pix`), junto de `stripe_card` e `asaas_pix_legacy`.
- Dunning (2 avisos → escada de ofertas) e `customer-portal` roteiam pelo trilho.
- `woovi-pix-auto-audit` diário: parcela paga sem webhook, mandato parado em `CREATED`, órfãos.

## Fase 3 — Inter como trilho de custo (condicional à Fase 0)

- `_shared/inter-pix.ts`: OAuth client_credentials com mTLS, cache de token, e as rotas de recorrência/solicitação/`cobr`.
- Motor próprio de ciclo: agendar a `cobr` na janela permitida, escalonar retentativas, fechar ciclo, tratar revogação de mandato.
- Migração em canário: `pix_gateway = inter` só pra novas vendas, Woovi mantida como fallback automático; nenhum assinante é movido de trilho à força.
- Rotação de certificado com alerta antecipado no admin — certificado vencido derruba **toda** a cobrança recorrente de uma vez.

## Detalhes técnicos

- Secrets do Inter: `INTER_CLIENT_ID`, `INTER_CLIENT_SECRET`, `INTER_CERT_PEM`, `INTER_KEY_PEM` (o certificado cabe no limite de 24 KB por secret).
- Secret da Woovi: `WOOVI_APP_ID`.
- Sandbox do Inter existe e será usada na Fase 0/3; o Pix Automático real só valida com uma venda de verdade acompanhada até o débito de D+7.
- Nenhuma camada multi-gateway genérica: uma chave decide o trilho, e cada trilho tem sua função de criação, seu webhook e sua auditoria.

## Ordem

Fase 0 (probe do Inter, em paralelo) → Fase 1 (Woovi no ar) → Fase 2 → Fase 3 só se o probe passar e o volume justificar.
