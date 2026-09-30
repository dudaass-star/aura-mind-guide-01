# Consolidar acessos duplicados sem perder histórico

## Objetivo
Corrigir o acesso da Isabella e substituir o fluxo frágil por uma consolidação segura para qualquer cliente na mesma situação.

## Implementação
- Criar uma operação única no banco que reúna perfil, conversas, sessões, memórias, relatórios e demais registros no acesso atual.
- Fazer a operação inteira confirmar ou desfazer todas as alterações se qualquer parte falhar, evitando dados divididos.
- Tratar registros já movidos por tentativas anteriores sem apagar o histórico válido.
- Alterar a confirmação do WhatsApp para chamar apenas essa operação protegida, em vez de atualizar várias áreas separadamente.
- Preservar a proteção contra alguém tentar assumir uma conta apenas conhecendo o telefone.

## Correção da Isabella
- Consolidar o histórico antigo no acesso atual dela.
- Conferir contagens e vínculos antes e depois.
- Simular entrada, recarga e leitura do histórico com a identidade atual.

## Validação geral
- Testar conta sem duplicidade, conta antiga ainda válida, identidade antiga removida e tentativa parcialmente concluída.
- Auditar outras contas com perfil apontando para uma identidade inexistente antes de qualquer reparo em lote.

## Detalhes técnicos
- A consolidação será transacional e executada no banco por uma função interna, chamada somente pela função autenticada de vínculo.
- O acesso atual prevalece apenas quando e-mail ou telefone já identificaram o perfil e as regras de titularidade permitirem.
