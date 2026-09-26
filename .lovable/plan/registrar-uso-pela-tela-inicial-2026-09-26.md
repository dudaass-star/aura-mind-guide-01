# Registrar uso pela tela inicial

## Resultado
- Registrar no histórico do cliente quando o Olá Aura for aberto pelo ícone da tela inicial.
- Não considerar acessos pelo navegador como instalação.
- Mostrar na Gestão de Usuários se houve uso pela tela inicial e quando foi a última abertura.

## Implementação
- Aproveitar os eventos de uso já existentes, com acesso restrito ao próprio cliente e aos administradores.
- Detectar o modo instalado no iPhone e em navegadores compatíveis.
- Validar a gravação e a exibição no painel sem alterar o fluxo de entrada do cliente.
