# Decisões técnicas

- Contas de demonstração usam `profiles.status = 'demo'`, com direito de acesso apenas ao App e sem telefone/cobrança; isso permite separar personagens fictícios de clientes ativos em rotinas e indicadores.
- O acesso compartilhado à personagem usa convites individuais com token protegido e validade de 7 dias, que geram uma sessão apenas no clique; isso evita ampliar globalmente a validade dos links normais.
- Falhas da conversa usam descritor comum e só retomam as transitórias; isso evita reenvios terminais.
- A conversa móvel herda a altura do contêiner ajustado pelo visualViewport, em vez de fixar 100dvh nas telas internas; isso mantém a caixa vazia visível quando o teclado reduz a área útil.
- A abertura pelo ícone da tela inicial é registrada em portal_value_events somente após autenticação e detecção de modo standalone; o painel consulta a última abertura por usuário sem inferir instalação a partir do navegador.
- O PortalAuthProvider isola a sessão admin e serializa o vínculo; consolidação transacional só ocorre se a identidade antiga já não existe.
- Pedidos explícitos de encerrar uma sessão aceitam artigos e pronomes entre o verbo e “sessão/encontro”; isso reconhece a fala natural sem transformar despedidas comuns em encerramento.
- A avaliação de uma sessão concluída é solicitada na própria conversa do App e registrada pelo fluxo autenticado de experiência; isso não depende de telefone nem do pós-sessão no WhatsApp.
- Sessões em andamento mudam suavemente o contexto visual da conversa e mostram progresso no cabeçalho; o aviso de fechamento nunca entra como mensagem da AURA.
- AURA evita confirmação ritual e perguntas seguidas; revelação nova mantém Presença e impede fechamento por tempo.
- O fio entre encontros fica separado de compromissos e é retomado sem tarefa artificial.
- PIX: sonda só diagnostica; o checkout bloqueia apenas com `pix_gateway=off` e reconcilia pela mesma identidade.
- O Movimento Olá Aura separa alcance, primeira conversa e continuidade; participação pública é opcional e reconhecimento não usa ranking comercial.
- A atribuição do Movimento é reivindicada na autenticação global do App e o Mural exige consentimento individual; isso preserva impacto e privacidade sem depender de visitar a área do Movimento.
- Participante e Embaixador são papéis distintos; link, divulgação, impacto e conquistas de indicação exigem adesão voluntária registrada em `movement_members.ambassador_since`.
- A latência da conversa é medida por etapa em `chat_turn_metrics.performance_breakdown`, separando preparação, provedor de IA, tratamento e gravação; isso evita atribuir ao modelo atrasos do fluxo ao redor dele.
