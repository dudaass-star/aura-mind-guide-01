# Decisões técnicas

- Contas de demonstração usam `profiles.status = 'demo'`, com direito de acesso apenas ao App e sem telefone/cobrança; isso permite separar personagens fictícios de clientes ativos em rotinas e indicadores.
- O acesso compartilhado à personagem usa convites individuais com token protegido e validade de 7 dias, que geram uma sessão apenas no clique; isso evita ampliar globalmente a validade dos links normais.
- Diagnósticos de falha da conversa usam o descritor compartilhado de erros e só retomam falhas transitórias; isso preserva detalhes operacionais e evita reenvios para erros terminais.
- A conversa móvel herda a altura do contêiner ajustado pelo visualViewport, em vez de fixar 100dvh nas telas internas; isso mantém a caixa vazia visível quando o teclado reduz a área útil.
- A abertura pelo ícone da tela inicial é registrada em portal_value_events somente após autenticação e detecção de modo standalone; o painel consulta a última abertura por usuário sem inferir instalação a partir do navegador.
- O PortalAuthProvider isola a sessão admin e serializa o vínculo; a consolidação transacional preserva o perfil e impede histórico dividido entre identidades.
- Pedidos explícitos de encerrar uma sessão aceitam artigos e pronomes entre o verbo e “sessão/encontro”; isso reconhece a fala natural sem transformar despedidas comuns em encerramento.
- A avaliação de uma sessão concluída é solicitada na própria conversa do App e registrada pelo fluxo autenticado de experiência; isso não depende de telefone nem do pós-sessão no WhatsApp.
- Sessões em andamento mudam suavemente o contexto visual da conversa e mostram progresso no cabeçalho; o aviso de fechamento nunca entra como mensagem da AURA.
- AURA evita confirmação ritual e perguntas seguidas; revelação nova mantém Presença e impede fechamento por tempo.
- Salvar o fio separado de compromissos e retomá-lo por todo o período entre encontros preserva continuidade sem tarefa artificial.