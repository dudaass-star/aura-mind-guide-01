# Pós-pagamento centrado no app Olá Aura

## Objetivo

Fazer o cliente entender, desde a confirmação do pagamento, que recebeu acesso ao **app Olá Aura**. A **AURA** permanece como a pessoa com quem ele conversa. “Meu Espaço”, “painel pessoal” e “área pessoal” deixam de aparecer para o cliente, sem alterar os endereços antigos e sem quebrar links já enviados.

## O que será ajustado

1. **Confirmação do pagamento**
   - Atualizar a tela de sucesso para a identidade visual atual do app.
   - Trocar a orientação centrada no WhatsApp por abertura prioritária do app Olá Aura.
   - Mostrar claramente os estados: confirmando, acesso liberado e recuperação de entrada.
   - Apresentar Conversa, Sessões, Jornadas, Percurso e Meditações como parte do acesso.

2. **Cartão e PIX**
   - Manter a entrada automática já existente após o cartão.
   - Fazer o PIX acompanhar a confirmação enquanto a tela estiver aberta e conduzir ao app assim que o pagamento for reconhecido.
   - Preservar a confirmação segura pelo provedor: nenhuma funcionalidade será liberada antes do pagamento real.
   - Manter uma alternativa clara para entrar no app quando a abertura automática não estiver disponível.

3. **WhatsApp pós-compra**
   - Apresentar “seu acesso ao app Olá Aura foi liberado”.
   - Priorizar o link para abrir o app; o WhatsApp passa a ser aviso, entrada auxiliar e recuperação.
   - Manter a AURA como identidade da conversa e preservar o convite posterior para a primeira sessão.
   - Não alterar templates aprovados de forma que invalide a configuração atual; adequar os textos livres e variáveis permitidas.

4. **E-mail de boas-vindas**
   - Redesenhar a mensagem em torno do app Olá Aura.
   - Usar “Abrir o app Olá Aura” como ação principal.
   - Apresentar conversa com a AURA, sessões, jornadas, percurso e meditações.
   - Deixar o WhatsApp como alternativa de ajuda, não como primeiro passo obrigatório.

5. **Linguagem em toda a jornada**
   - Substituir textos visíveis como “Meu Espaço”, “painel pessoal” e “área pessoal”.
   - Atualizar confirmação, teste, cancelamento, reautorização, acesso administrativo enviado ao cliente e mensagens de suporte relacionadas.
   - Manter internamente o endereço `/meu-espaco` para compatibilidade com links existentes.

6. **Boas-vindas dentro do app**
   - Garantir que o cliente que entra direto no app receba uma introdução coerente, mesmo sem clicar primeiro no WhatsApp.
   - Evitar duplicar a mesma mensagem caso ele também responda ao template.
   - Preservar histórico, preferências e convite da primeira sessão.

## Validação

- Testar em celular os estados de confirmação, espera, acesso liberado e recuperação.
- Simular cartão e PIX sem realizar cobranças reais.
- Verificar que textos antigos não aparecem mais nas telas e mensagens alteradas.
- Confirmar que links antigos continuam abrindo o app.
- Validar que a abertura automática não libera acesso sem confirmação e não duplica boas-vindas.

## Limites desta entrega

- Os endereços técnicos existentes continuam iguais para não quebrar acessos antigos.
- Alterações que exijam nova aprovação externa de template do WhatsApp serão preparadas sem desativar o template atualmente aprovado.
- A confirmação física de pagamento em produção continuará dependendo de uma transação real de cada provedor.
