# Entrada normal integrada ao aplicativo — plano revisado

## Decisão de produto

Manter o **checkout atual como caminho principal de alta intenção** e transformar o aplicativo no destino natural depois da compra. O cliente informa seus dados uma vez, paga sem criar senha e entra automaticamente no aparelho usado. Antes da confirmação, poderá abrir e instalar apenas uma versão limitada do aplicativo, sem conversa ou consumo de IA.

Não criar `profiles` nem uma conta autenticada antes do pagamento. Isso preserva a conversão simples do checkout, evita contas falsas e não contamina aquisição, Plano Semanal, Meta Purchase ou a distinção entre cliente novo e existente.

## Por que este desenho

- Checkouts móveis convertem melhor quando pedem somente os dados necessários, deixam preço e recorrência claros e não impõem criação de conta antes da compra ([Stripe](https://stripe.com/resources/more/checkout-flow-design-strategies-that-can-help-boost-conversion-and-customer-retention)).
- Em apps de assinatura, paywalls diretos tendem a converter mais que freemium; a futura sessão gratuita deve ser um experimento separado, não uma mudança silenciosa no fluxo vencedor ([RevenueCat](https://www.revenuecat.com/state-of-subscription-apps/)).
- Retenção começa na ativação inicial. Para a AURA, o primeiro valor é conversar e sentir continuidade, não preencher um onboarding longo.
- Instalação e notificações funcionam melhor depois de valor percebido e de uma ação explícita; prompts prematuros aumentam recusas e bloqueios ([web.dev](https://web.dev/articles/permissions-best-practices)). No iPhone, web push exige o app adicionado à tela inicial ([Apple](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)).
- Recuperação de pagamento e cancelamento são alavancas diferentes de LTV; atraso, não uso, preço e insatisfação devem continuar separados. Pausa, troca de plano e recuperação contextual são práticas consolidadas ([Paddle](https://developer.paddle.com/concepts/retain/cancellation-flows-surveys)).

## Jornada do cliente

### 1. Checkout sem atrito

1. A pessoa informa nome, e-mail e WhatsApp no checkout atual.
2. A AURA mantém o prewarm já existente, preços, ciclos, Plano Semanal e gateways atuais.
3. Ao iniciar cartão ou PIX, o servidor cria uma **intenção segura de acesso**, separada de `profiles`.
4. O navegador guarda apenas um segredo aleatório de alta entropia; nome, e-mail ou telefone isolados nunca concedem acesso.

### 2. Pagamento e retorno

- **Cartão:** vincular a intenção ao `checkout_session` da Stripe e retornar ao aplicativo.
- **PIX:** vincular a mesma intenção à cobrança do provedor e manter QR, polling e reconciliação específicos de Asaas, Inter ou Woovi.
- A tela de retorno consulta o servidor e mostra somente estados verificáveis: `aguardando`, `confirmando`, `pago` ou `não concluído`.
- Somente webhook/reconciliação idempotente concede o plano. A tela de agradecimento nunca libera acesso.

### 3. Entrada automática depois de pago

- Em uma primeira compra legítima, o segredo do aparelho poderá ser trocado uma única vez por uma sessão persistente do portal, somente após a intenção estar paga e vinculada ao perfil criado pelo webhook.
- Se já existir uma conta, o checkout não dará acesso ao histórico apenas por coincidência de e-mail ou telefone. A pessoa confirma a identidade pelo link seguro do WhatsApp ou código de oito dígitos.
- Reaberturas no mesmo aparelho usam a sessão persistida. Código e WhatsApp ficam para recuperação, sessão encerrada ou troca de aparelho.

### 4. Primeiro valor e instalação

- Na primeira entrada paga, abrir o aplicativo pronto para conversar, sem questionário obrigatório.
- Medir o tempo até a primeira mensagem e a primeira resposta útil da AURA.
- Oferecer instalação depois da primeira interação de valor; manter “Instalar aplicativo” no menu e um lembrete discreto posterior para quem adiar.
- Android/desktop usam o prompt nativo quando disponível; iPhone recebe o guia curto de “Adicionar à Tela de Início”.

### 5. Se não pagar

A pessoa poderá abrir e instalar uma área limitada, de custo operacional quase zero, para:

- ver plano, ciclo e situação da tentativa;
- retomar cartão ou PIX sem redigitar tudo;
- trocar o plano antes da compra;
- acessar suporte e recuperação segura.

Não poderá conversar com a AURA, gerar áudio, iniciar sessão, acessar histórico, jornadas ou conteúdo pago. A área limitada não será chamada de plano Base/Lite, pois esses são produtos pagos de retenção.

## Especificação técnica

### Intenção e autorização

- Manter `checkout_sessions` como registro de tentativa e acrescentar uma entidade específica de **claim de acesso** ligada à tentativa, com `token_hash`, estado, expiração, uso único, gateway e identificadores externos.
- Não armazenar o segredo bruto no banco; aplicar rate limit, expiração e revogação após troca pela sessão.
- Transportar somente o identificador opaco da intenção nos metadados de Stripe/PIX e no retorno.
- Tornar as transições monotônicas e idempotentes: um estado pago não pode regredir por webhook atrasado.
- Reutilizar o mecanismo seguro já existente em `portal-whatsapp-access` para gerar/verificar a sessão, adaptando-o para uma intenção paga.

### Entitlements no servidor

- Criar uma verificação central de direito de uso baseada em perfil, status, validade e produto efetivamente pago.
- Aplicá-la no `app-chat` antes de persistir ou processar mensagens e nos endpoints de sessões, áudios, jornadas e links assinados.
- Não confiar no bloqueio visual do `UserPortal`.
- Preservar acesso de clientes `past_due`/`payment_failed` conforme as regras atuais de recuperação e período efetivamente pago; não rebaixar clientes existentes.

### Compatibilidade financeira

- Preservar a regra de primeira compra do Plano Semanal e a conversão para mensal no oitavo dia.
- Não alterar preços, ciclos, gateways, idempotência, cobrança recorrente ou prazo de acesso.
- Tratar cartão, PIX automático e PIX à vista como trilhos distintos; “mandato autorizado” não equivale a dinheiro confirmado.
- Garantir que a intenção pré-pagamento não transforme uma primeira compra em upgrade/retorno nas funções e webhooks atuais.

### Instrumentação sem duplicidade

Usar o funil existente, acrescentando apenas eventos necessários:

`dados válidos → pagamento iniciado → intenção criada → retorno recebido → pagamento confirmado → sessão concedida → primeira mensagem → primeira resposta útil → instalação oferecida → instalação concluída`

- Remover a semântica de `purchase` disparada apenas por abrir `ThankYou`; esse evento vira visualização/retorno.
- `Purchase` e `purchase_confirmed` continuam sendo emitidos pelo servidor somente para aquisição realmente confirmada, nunca para renovação, retorno ou simples autorização PIX.
- Deduplicar navegador/CAPI com o mesmo identificador de evento.
- Registrar abandono, recusa, erro interno e processamento demorado separadamente.

## Métricas de conversão e LTV

### Métrica principal

- Receita e margem de contribuição por visitante/coorte, não apenas instalações ou contas criadas.

### Conversão

- dados válidos → pagamento iniciado;
- pagamento iniciado → confirmado, por gateway/plano/ciclo;
- retorno pago → sessão concedida;
- abandono recuperado em 24 horas e 7 dias.

### Ativação e retenção

- tempo até primeira mensagem e primeira resposta útil;
- compradores ativos em D1, D7, D30 e por mês de vida;
- primeira sessão concluída e retorno após a sessão;
- instalação concluída entre pagantes ativados;
- churn voluntário por motivo, churn involuntário, recuperação e reativação;
- LTV e margem por origem, plano, gateway e coorte.

## Recuperação e LTV sem pressão

- Retomar a tentativa exata, com plano e método preservados, em vez de mandar checkout genérico.
- Respeitar opt-out e preferência de canal; a persona AURA não fará upsell dentro de uma conversa emocional.
- Depois da ativação, usar sinais de não uso para lembretes úteis e mensuráveis, sem simular preocupação clínica.
- Manter cancelamento simples, consentimento de recorrência claro e acesso até o fim do período efetivamente pago.
- Push não entra nesta entrega: a base ficará pronta, mas a permissão será implantada depois, em contexto e com medição própria.

## Testes obrigatórios de não regressão

- Novo cliente: cartão aprovado, recusado e retorno atrasado.
- PIX: QR abandonado, confirmação imediata, confirmação tardia, webhook duplicado e cada provedor ativo.
- Plano Semanal: primeira compra, tentativa repetida e cliente inelegível.
- Cliente existente: nenhuma exposição de histórico ou vinculação automática por dados digitados.
- Área limitada: tentativa direta de chamar chat, áudio, sessão, jornada e storage assinada deve ser recusada pelo servidor.
- Métricas: uma compra gera uma aquisição; retorno, renovação e refresh não geram outra.
- Reabertura no mesmo aparelho, aba duplicada, token usado duas vezes, token expirado e troca de aparelho.
- Android e iPhone: checkout, retorno, instalação e reabertura.

## Implantação segura

1. Registrar a linha de base atual de conversão, falhas, ativação e Purchase por gateway.
2. Publicar schema, claim seguro, status e entitlement central com a funcionalidade desligada.
3. Validar contas isoladas e cenários de ataque/duplicidade.
4. Ativar por feature flag primeiro para equipe, depois para uma pequena parcela de novos clientes de cartão.
5. Expandir cartão e só então cada trilho PIX separadamente.
6. Interromper ou reverter se cair a confirmação de pagamento, surgir Purchase duplicado, houver acesso indevido ou aumentar erro no checkout.
7. Depois de estabilidade, executar como campanha separada o experimento de sessão gratuita de 30 minutos.

## Fora desta entrega

- sessão gratuita e campanha app-first;
- notificações push e promoções;
- mudança de preço, plano, gateway ou política de cobrança;
- alteração do fluxo de clientes atuais além da recuperação segura.