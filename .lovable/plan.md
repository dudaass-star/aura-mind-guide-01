# Tornar o acesso ao Meu Espaço confiável de ponta a ponta

## Diagnóstico confirmado

No caso da Patrícia, o pagamento de R$ 6,90 foi confirmado em 16/08, o acesso foi liberado até 23/08 e as boas-vindas chegaram pelo WhatsApp. Ela tentou entrar no painel, uma conta de acesso foi criada e três e-mails de código foram aceitos pelo serviço de envio, mas ela nunca conseguiu concluir o login.

O registro `sent` atual significa apenas que o serviço de e-mail aceitou a mensagem; não confirma entrega na caixa da cliente. O perfil pago também permaneceu ligado ao identificador antigo, pois esse vínculo só acontece depois que a pessoa consegue entrar. Portanto, o sistema hoje consegue registrar “código enviado” mesmo quando o cliente continua sem acesso.

A correção anterior não cobriu esse ponto: ela criou uma rede de segurança para as boas-vindas no WhatsApp e melhorou o vínculo depois do login, mas não criou recuperação para quem não recebe o código. A ferramenta que gera um acesso alternativo existe, porém é manual e restrita ao administrador.

O problema é sistêmico, não exclusivo da Patrícia:

- Desde 01/08, 158 compradores Woovi têm e-mail cadastrado; 90 nunca criaram conta de acesso — isso, sozinho, não é erro, pois podem nunca ter tentado entrar.
- 13 criaram a conta, receberam e-mail aceito pelo serviço, nunca entraram e continuam sem vínculo com o perfil pago. Esse é o mesmo estado técnico da Patrícia.
- A infraestrutura de e-mail está saudável agora, mas existem 28 mensagens antigas encerradas definitivamente sem nova tentativa automática.
- Não há recuperação automática para código expirado, filtrado, atrasado ou não entregue.

## Correção definitiva

### 1. Criar um gravador único do estado de acesso

- Registrar cada etapa: acesso solicitado, código enfileirado, envio aceito, falha, expiração, login concluído e perfil vinculado.
- Não tratar `sent` como acesso concluído; sucesso real será `primeiro login + vínculo do perfil pago`.
- Usar o mesmo acompanhamento para Woovi, cartão e demais meios de pagamento.

### 2. Recuperar automaticamente quem pediu acesso e não entrou

- Após a solicitação do código, verificar se houve login e vínculo dentro de uma janela curta.
- Se o e-mail falhar, expirar ou continuar sem login, gerar uma nova tentativa automaticamente, respeitando limite e validade.
- Se ainda não houver entrada, mandar pelo WhatsApp cadastrado uma mensagem humana com um acesso seguro e de uso único.
- Nunca enviar acesso para telefone ou e-mail que não pertença ao perfil pago.

### 3. Resolver pelo próprio WhatsApp, sem depender de intervenção humana

- Reconhecer de forma determinística frases como “não chegou o código”, “não consigo entrar” e “paguei e não acessei”.
- Antes de responder, consultar pagamento, validade, tentativas de acesso e vínculo reais.
- Para cliente pago no número cadastrado, gerar e entregar um acesso seguro na hora; não mandar pagar novamente e não apenas explicar o procedimento.
- Se a pessoa pediu devolução, manter esse pedido separado da correção de acesso.

### 4. Tornar o vínculo do perfil idempotente e completo

- Centralizar a migração do identificador antigo para o usuário autenticado.
- Propagar o vínculo também para tabelas de pagamento Woovi e demais relações hoje não incluídas na migração.
- Executar tudo como uma operação verificável: ou o perfil e suas relações ficam vinculados, ou a tentativa fica registrada para repetição segura.
- Impedir dois perfis para o mesmo comprador e preservar a proteção contra vincular telefone de outra pessoa.

### 5. Melhorar a tela quando o código não chega

- Adicionar reenvio real com contagem regressiva e confirmação do endereço digitado.
- Mostrar alternativa imediata pelo Google quando o e-mail for compatível.
- Oferecer “Receber ajuda pelo meu WhatsApp cadastrado” após a primeira falha, sem expor detalhes internos.
- Diferenciar claramente: código incorreto, código expirado, envio temporariamente indisponível e conta não encontrada.

### 6. Fechar os buracos da fila de e-mail

- Aumentar a tolerância da fila para que uma indisponibilidade curta não descarte códigos ainda úteis.
- Reprocessar falhas temporárias com limite; códigos já expirados devem ser substituídos por um novo, nunca reenviados.
- Considerar bloqueios e devoluções de e-mail antes de prometer “código enviado”.
- Quando o e-mail não for confiável, mudar automaticamente para a recuperação pelo WhatsApp cadastrado.

### 7. Reparar os casos existentes sem disparo indiscriminado

- Identificar os 13 casos no mesmo estado da Patrícia e separar ativos, cancelados e pessoas que já resolveram por outro caminho.
- Corrigir os vínculos que já podem ser comprovados com segurança.
- Acionar somente clientes ativos que efetivamente tentaram entrar e continuam sem acesso; não mandar mensagem para todos os compradores que nunca abriram o painel.
- Tratar a Patrícia à parte: assinatura cancelada e pedido de devolução, sem reativar ou oferecer nova cobrança.

## Validação obrigatória

1. Pagamento confirmado → WhatsApp de boas-vindas → pedido de código → entrada → perfil correto carregado.
2. E-mail entregue normalmente.
3. E-mail temporariamente indisponível e recuperado sem perder o cliente.
4. Código expirado substituído por um novo.
5. E-mail bloqueado ou devolvido → acesso seguro pelo WhatsApp cadastrado.
6. E-mail diferente do checkout → confirmação por telefone e vínculo correto.
7. Telefone de outra conta → bloqueio sem vazamento de dados.
8. Repetição do fluxo sem criar duas contas, dois perfis ou mover dados duas vezes.
9. Cliente cancelado não é reativado pelo reparo de acesso.
10. Agente nunca afirma “não pagou” sem consultar o pagamento real.

## Critério de conclusão

O fluxo só será considerado resolvido quando uma simulação completa provar que nenhum caminho termina apenas em “e-mail enviado”: toda tentativa precisa terminar em acesso vinculado, nova tentativa automática ou alternativa segura pelo WhatsApp — nunca em silêncio.