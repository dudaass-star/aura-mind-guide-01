Plano:

1. Republicar somente o micro agent `schedule-tag-extractor`.
2. Fazer um teste sintético direto nele com um caso D0 controlado:
   - usuário aceitou a sessão inicial;
   - Aura confirmou verbalmente;
   - nenhuma tag `[AGENDAR_SESSAO]` veio na resposta;
   - horário concreto presente no diálogo.
3. Conferir a resposta do micro agent:
   - se ele extrai a intenção correta;
   - se gera a tag esperada;
   - se não cria sessão sozinho;
   - se retorna erro limpo em caso inválido.
4. Conferir logs do `schedule-tag-extractor` para confirmar que a chamada chegou em produção e registrou o resultado.
5. Se o micro agent passar no teste direto, registrar a conclusão: o micro agent está saudável; o próximo ponto a validar seria o gatilho dentro do `aura-agent`, porque é ele que precisa chamar esse micro agent quando a Aura esquece a tag.