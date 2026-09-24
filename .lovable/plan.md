# Sobre você: retrato confiável e construído em conjunto

## Objetivo
Transformar “Sobre você” em uma visão atual, útil e confiável: fatos declarados ficam distintos de leituras da AURA, toda hipótese pode ser confirmada ou corrigida, e apagar significa deixar de usar aquela informação.

## Implementação

1. **Privacidade e integridade**
   - Restringir geração e leitura do retrato ao cliente autenticado correto.
   - Remover o acesso amplo baseado apenas na existência de um token antigo.
   - Centralizar inclusão, edição, confirmação, correção e exclusão em operações seguras.

2. **Fato, hipótese e confirmação**
   - Registrar a origem e o estado de validação dos itens do retrato.
   - Identificar informações contadas pelo cliente, leituras pendentes e leituras confirmadas.
   - Exibir “Faz sentido” e “Não foi bem assim” em cada leitura inferida.
   - Aplicar correções imediatamente, sem depender de análise posterior ou aviso administrativo.

3. **Retrato vivo**
   - Invalidar e reconstruir o retrato após mudanças relevantes.
   - Mostrar a última versão confiável imediatamente e sincronizar em segundo plano.
   - Fazer exclusões prevalecerem sobre memórias e versões derivadas.

4. **Experiência da área**
   - Manter “Sobre você” focado em identidade atual; deixar evolução histórica no Percurso.
   - Simplificar a contribuição para uma pergunta progressiva por vez.
   - Permitir adicionar fatos diretamente e explicar de forma breve como serão usados.
   - Manter pontos sensíveis recolhidos e controláveis pelo cliente.

5. **Medição de qualidade**
   - Registrar abertura, contribuição, confirmação, correção, exclusão e retorno à conversa.
   - Corrigir “correções por 100 conversas” para usar conversas concluídas e deduplicar por conversa.
   - Separar correções de fatos, hipóteses, contexto e preferências.

## Validação
- Verificar permissões e isolamento entre clientes.
- Simular retrato vazio, contribuição, edição, confirmação, correção, exclusão e atualização.
- Confirmar que conteúdo apagado deixa de aparecer e de orientar a AURA.
- Testar celular e computador, inclusive reabertura e falhas de rede.
- Executar verificação de tipos, testes das funções e auditoria de segurança.
