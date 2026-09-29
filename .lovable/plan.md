# Acesso de 7 dias e organização da conta demo

## Resultado
- Cada clique em “Copiar link do app Olá Aura” criará um link individual da Marina, reutilizável por 7 dias.
- No primeiro acesso, o criador entra diretamente no App; a sessão permanece no aparelho e se renova normalmente.
- A conversa preservará a jornada fictícia coerente já preparada e removerá os testes técnicos posteriores.
- Os criadores poderão continuar conversando livremente a partir do último ponto da jornada.

## Implementação
1. Criar convites temporários com token aleatório protegido, validade, revogação e registro de uso. Somente a administração poderá gerar convites; o App poderá consumir apenas um token válido.
2. Trocar o link de autenticação de 1 hora por uma página de convite que valida o acesso e cria a sessão no momento do clique, sem alterar a segurança dos acessos normais.
3. Atualizar a mensagem administrativa para informar claramente a validade de 7 dias.
4. Preservar as 48 mensagens fictícias coerentes de 17 a 27/09 e a sessão principal de 20/09. Remover as 311 mensagens de simulações técnicas de 28–29/09 e as cinco sessões temporárias ligadas a esses testes.
5. Validar geração, abertura, autenticação, permanência da sessão e continuidade da conversa em celular e desktop.

## Segurança e escopo
- O convite será longo, imprevisível, armazenado somente como hash e terá expiração no servidor.
- Um link compartilhado continua dando acesso à personagem até expirar; por isso, cada criador deve receber seu próprio link.
- Não serão alterados cobrança, métricas de clientes reais, histórico de outros usuários, resumo ou memória da jornada original da Marina.
