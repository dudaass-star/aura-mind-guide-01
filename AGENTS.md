# Decisões técnicas

- Contas de demonstração usam `profiles.status = 'demo'`, com direito de acesso apenas ao App e sem telefone/cobrança; isso permite separar personagens fictícios de clientes ativos em rotinas e indicadores.
- O acesso compartilhado à personagem é distribuído por links individuais e temporários gerados na administração, não por uma senha publicada; isso limita vazamento e permite reutilizar o mesmo histórico.
- Diagnósticos de falha da conversa usam o descritor compartilhado de erros e só retomam falhas transitórias; isso preserva detalhes operacionais e evita reenvios para erros terminais.
- A conversa móvel herda a altura do contêiner ajustado pelo visualViewport, em vez de fixar 100dvh nas telas internas; isso mantém a caixa vazia visível quando o teclado reduz a área útil.