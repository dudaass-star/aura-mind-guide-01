# Correção definitiva do vazamento de nomes entre contextos

## Objetivo
Impedir que exemplos internos, respostas da própria Aura ou qualquer dado não confirmado pelo usuário sejam tratados como memória pessoal ou reapareçam em outra conversa.

## Ajustes

### 1. Remover dados reais de todas as orientações compartilhadas
- Retirar “Bella”, “Selena”, “Eduardo” e outros exemplos derivados de clientes dos textos internos da Aura.
- Corrigir os três pontos já confirmados: conversa principal, acompanhamento automático e geração do retrato pessoal.
- Fazer uma varredura completa nos demais textos e modelos de mensagem para eliminar outros dados pessoais usados como exemplo.
- Reescrever exemplos com linguagem neutra, sem nomes próprios reutilizáveis.

### 2. Criar uma barreira antes do envio
- Antes de enviar uma resposta, verificar nomes próprios novos usados pela Aura.
- Permitir apenas nomes confirmados nas mensagens daquele usuário ou em sua memória individual validada.
- Se a resposta introduzir um nome não confirmado, descartá-la e gerar novamente com uma instrução explícita para não nomear a pessoa.
- Se a nova tentativa ainda falhar, enviar uma resposta segura sem nomes, em vez de arriscar outra atribuição.
- Registrar tecnicamente o bloqueio para medição, sem criar alerta ou nova tela administrativa.

### 3. Impedir que a Aura grave a própria invenção como memória
- Para informações da categoria “pessoa”, aceitar nomes somente quando estiverem presentes em fala do usuário.
- Não considerar a resposta da Aura como fonte de confirmação factual.
- Se o usuário disser apenas “minhas filhas”, guardar a relação sem inventar nomes.
- Evitar que repetidas análises assíncronas aumentem a confiança de um dado que não veio do usuário.

### 4. Limpar o incidente da Ana
- Remover da memória de Ana somente o registro incorreto `filhas = Selena`.
- Preservar as correções registradas após o incidente, pois elas funcionam como proteção adicional.
- Confirmar que o resumo, retrato, sessões e demais memórias dela não receberam Bella ou Selena.

### 5. Endurecer o isolamento preventivamente
- Manter todas as leituras de memória obrigatoriamente vinculadas ao identificador único do usuário.
- Trocar seleções ambíguas de perfil por telefone por uma falha segura quando houver mais de um candidato, em vez de escolher silenciosamente um registro.
- Remover o identificador temporário de mensagem armazenado em escopo global e mantê-lo restrito à própria requisição.

### 6. Testes e validação
- Criar testes com usuários sem nomes de familiares e mensagens como “vou cuidar das minhas filhas”.
- Confirmar que nenhum nome não informado aparece na resposta nem é salvo na memória.
- Testar duas conversas simultâneas com histórias e nomes diferentes para provar isolamento.
- Auditar as respostas históricas procurando nomes dos exemplos removidos fora das contas corretas.
- Invalidar o texto compartilhado antigo, publicar as funções afetadas e validar em produção pelos registros das novas chamadas.

## Resultado esperado
- Dados de clientes deixam de existir em orientações globais.
- A Aura não envia nomes que o próprio usuário não confirmou.
- Uma invenção do modelo não consegue virar memória persistente.
- O dado incorreto de Ana é removido sem apagar o restante da história dela.
- O sistema passa a falhar de forma segura diante de qualquer dúvida de identidade.

## Detalhes técnicos
Funções afetadas: agente principal da Aura, análise pós-conversa, acompanhamento automático, geração de retrato e recebimento de mensagens. Não será criada tela nova nem aviso administrativo. A alteração de dados será restrita ao único registro contaminado confirmado.
