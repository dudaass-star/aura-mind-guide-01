# Resolver “não recebi o código” no Meu Espaço

## O problema exato

Hoje o cliente pode entrar com Google ou pedir um código/link por e-mail. Código e link usam o mesmo canal; portanto, quando o e-mail é filtrado, atrasado ou não entregue, os dois falham juntos.

No caso da Patrícia, três envios foram aceitos pelo serviço de e-mail, mas ela nunca entrou. Isso confirma o ponto central: “enviado” não significa “recebido”.

## Alternativas avaliadas

1. **Reenviar o código por e-mail** — deve continuar disponível, mas não resolve falha de entrega.
2. **Link mágico por e-mail** — é mais simples que digitar seis números, porém depende do mesmo e-mail e sofre a mesma falha.
3. **Entrar com Google** — já existe, é seguro e deve ganhar mais destaque; não atende quem comprou com outro provedor de e-mail ou não quer usar Google.
4. **Código por SMS** — adiciona custo, fraude e dependência de operadora; não é a melhor escolha para uma experiência que já acontece no WhatsApp.
5. **Passkey** — é a direção mais moderna para retornos futuros, mas precisa de um primeiro acesso bem-sucedido para ser cadastrada. Não resolve sozinha o primeiro “não recebi”.
6. **Link único pelo WhatsApp cadastrado** — é o melhor fallback para a Aura: usa o canal onde o cliente já conversa, elimina a dependência do e-mail e pode validar o número contra a assinatura.

## Solução recomendada

Manter três caminhos simples:

- **Continuar com Google** como primeira opção.
- **Receber código por e-mail** como alternativa normal.
- **Não recebeu? Entrar pelo WhatsApp cadastrado** como recuperação imediata.

Não enviar um novo código no WhatsApp. Enviar um **botão/link de acesso único**, com validade curta, que abre o Meu Espaço já autenticado. Isso reduz atrito e evita que o cliente copie números entre aplicativos.

## Implementação

### 1. Recuperação na própria tela

- Adicionar “Reenviar código” com contagem regressiva.
- Após o primeiro envio, exibir “Entrar pelo meu WhatsApp cadastrado”.
- Pedir apenas o WhatsApp usado na assinatura.
- Responder de forma neutra, sem revelar se um número não cadastrado pertence ou não a outra conta.

### 2. Link seguro pelo WhatsApp

- Localizar o perfil pela normalização do telefone e confirmar que ele possui assinatura ou acesso válido.
- Gerar uma credencial aleatória de uso único, armazenada somente como hash.
- Expirar em 10 minutos e invalidar no primeiro uso.
- Vincular a credencial ao perfil, telefone, finalidade `portal_login` e tentativa de acesso.
- Limitar solicitações por perfil e telefone.
- Enviar somente ao próprio número cadastrado, usando resposta livre dentro da janela de atendimento ou template aprovado fora dela.

### 3. Entrada e vínculo

- Ao abrir o link, trocar a credencial por uma sessão real do Meu Espaço.
- Vincular a conta autenticada ao perfil pago pelo fluxo existente.
- Invalidar o link antes de redirecionar ao painel, impedindo reutilização e compartilhamento.
- Se o perfil estiver cancelado e sem período pago vigente, não liberar conteúdo; mostrar o estado correto da conta.

### 4. Melhorar o caminho por e-mail

- Não afirmar “código enviado” quando houver falha conhecida na fila.
- Diferenciar código incorreto de código expirado.
- Gerar um código novo no reenvio; nunca reaproveitar um expirado.
- Manter Google visível também na etapa em que o cliente aguarda o e-mail.

### 5. Passkey depois do primeiro acesso

- Não faz parte da correção inicial.
- Pode ser adicionada depois como opção “entrar com biometria” para clientes recorrentes, reduzindo a dependência de e-mail e WhatsApp nos próximos acessos.

## Validação

1. Código por e-mail recebido e validado.
2. Código não recebido → reenvio funciona.
3. Código não recebido → link chega ao WhatsApp cadastrado e entra sem pedir código.
4. Número não cadastrado não revela dados e não recebe link.
5. Link expirado, já usado ou compartilhado é recusado.
6. Cliente com acesso vencido entra na conta, mas não recebe conteúdo pago indevidamente.
7. Google continua funcionando e vincula o perfil correto.
8. Testes em celular real, Gmail, Hotmail e Outlook.

## Critério de conclusão

Um cliente que não recebe o e-mail consegue entrar pelo WhatsApp cadastrado em poucos toques, sem suporte manual e sem criar um caminho de acesso reutilizável ou inseguro.