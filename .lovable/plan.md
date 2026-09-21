# Entrada normal integrada ao aplicativo

## Objetivo

Transformar o checkout atual na porta de entrada do aplicativo: o cliente se identifica uma vez, paga pelos meios já disponíveis e chega ao Meu Espaço sem senha ou código. A sessão gratuita não faz parte desta entrega.

## Jornada do cliente

1. O cliente informa nome, e-mail e WhatsApp no checkout atual.
2. Ao continuar para o pagamento, a AURA cria ou reconhece o acesso daquele aparelho de forma silenciosa.
3. Cartão e PIX seguem com a experiência e os preços atuais.
4. Pagamento confirmado abre o Meu Espaço com o plano liberado e a conversa pronta.
5. Se o pagamento ficar pendente ou for abandonado, o cliente permanece reconhecido, mas vê somente uma área limitada para retomar a compra.
6. O convite para instalar aparece dentro do aplicativo, sem bloquear checkout ou pagamento.
7. O código de oito dígitos e o link pelo WhatsApp permanecem como recuperação ou troca de aparelho.

## O que será construído

### Identificação antes do pagamento

- Criar um acesso preliminar vinculado a nome, e-mail e WhatsApp somente após o cliente tocar no botão de pagamento.
- Salvar a sessão nesse aparelho sem exigir senha ou código.
- Reaproveitar cadastros preliminares em tentativas repetidas, evitando contas duplicadas.
- Nunca entregar automaticamente o acesso de uma conta existente apenas porque alguém digitou o mesmo e-mail ou telefone; nesses casos, usar a recuperação segura existente.

### Separação entre cadastro e direito de uso

- Introduzir o estado de pagamento pendente para novos cadastros.
- Manter conversa, sessões, áudios, jornadas, histórico e demais recursos protegidos até a confirmação financeira.
- Reforçar o bloqueio também no envio de mensagens, impedindo que uma alteração visual ou chamada direta libere uso indevido.
- Preservar clientes ativos, atrasados em recuperação e assinaturas existentes sem rebaixamento.

### Área limitada

O cliente ainda não pago poderá:

- ver que seu acesso foi criado;
- instalar a AURA;
- consultar o plano escolhido e o estado do pagamento;
- retomar cartão ou PIX;
- alterar plano antes da compra;
- acessar recuperação de conta e suporte.

Não poderá iniciar conversa, consumir áudio, marcar sessão ou acessar conteúdo pago.

### Confirmação e retorno

- Cartão: vincular a tentativa ao acesso preliminar e levar o cliente ao Meu Espaço após a confirmação.
- PIX: manter o acompanhamento do pagamento e liberar somente quando o dinheiro for confirmado pelo provedor.
- Fazer a tela de retorno aguardar uma confirmação curta quando necessário, sem declarar pagamento antes da hora.
- Se a confirmação demorar, abrir a área limitada com estado “confirmando pagamento” e atualizar automaticamente.
- Preservar contexto, plano, ciclo e origem da campanha durante todo o percurso.

### Instrumentação

Registrar as etapas:

`dados concluídos → acesso criado → pagamento iniciado → pagamento pendente → pagamento confirmado → app liberado → instalação oferecida → instalação concluída`

Separar cartão e PIX e distinguir falha interna, abandono, recusa e pagamento ainda em processamento.

## Segurança e compatibilidade

- Links e credenciais preliminares serão de uso único, com validade curta e somente o resultado necessário será enviado ao navegador.
- A liberação continuará baseada na confirmação financeira do servidor, nunca na tela de agradecimento.
- O checkout atual permanecerá disponível durante a transição.
- Clientes atuais continuarão entrando pelos métodos já existentes.
- Nenhuma conversa será armazenada pelo mecanismo de instalação do aplicativo.

## Validação antes de liberar

- Novo cliente por cartão: cadastro, pagamento, retorno e conversa liberada.
- Novo cliente por PIX: cadastro, QR, confirmação e liberação.
- Abandono em cartão e PIX: sessão mantida e área limitada correta.
- Pagamento pendente: nenhuma função paga disponível.
- Cliente já existente: sem duplicação de conta, perfil ou assinatura.
- Reabertura e troca de aba: sessão preservada.
- Celular Android e iPhone: checkout, retorno, instalação e reabertura.
- Falha ou atraso do provedor: mensagem correta e retomada sem perda.

## Implantação

1. Publicar a base de identificação e proteção de acesso.
2. Ativar o retorno integrado para cartão.
3. Ativar o retorno integrado para PIX.
4. Validar com contas isoladas e pagamentos de teste quando disponíveis.
5. Fazer um piloto controlado antes de direcionar todo o tráfego.

## Fora desta entrega

- Sessão gratuita de 30 minutos.
- Campanha app-first gratuita.
- Notificações push e campanhas promocionais.

Esses itens entram depois que o fluxo normal estiver estável e mensurado.
