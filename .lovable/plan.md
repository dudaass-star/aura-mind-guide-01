## Diagnóstico

A investigação aponta que o problema não é mais corrida entre agenda mensal e D0. O problema atual é de máquina de estados do D0.

No caso Ernestina/Cacia:

- 00:41:43 BRT: usuária manda a primeira mensagem real depois do welcome.
- 00:42:04 BRT: Aura pergunta se ela topa abrir a primeira sessão agora.
- 00:42:28 BRT: usuária responde “Sim”.
- Depois disso houve conversa longa com cara de sessão, mas:
  - nenhuma sessão D0 foi criada/iniciada;
  - `current_session_id` ficou vazio;
  - não houve `started_at`, `ended_at`, `rating_requested`, `post_session_sent` nem extractor;
  - só foram criadas as 4 sessões mensais de quarta-feira.

A falha está neste padrão do código:

1. O bloco D0 injeta a pergunta binária quando `pending_first_session_invite=true`.
2. No fim do mesmo processamento, como a resposta da Aura ainda não contém `[AGENDAR_SESSAO]`, o cleanup trata isso como “não houve aceite”.
3. Isso limpa `pending_first_session_invite` cedo demais.
4. Quando a usuária responde “Sim”, o backend já não está mais em estado D0, então o LLM continua a conversa, mas nenhuma sessão é criada/iniciada.

Também há um segundo detalhe perigoso: respostas curtas como “Sim” e “Bora” são tratadas como possível clique de botão e podem ser ignoradas justamente quando são o aceite real do D0.

## Plano de correção

### 1. Separar os estados do D0

Ajustar o fluxo para distinguir claramente:

```text
D0 pendente -> convite perguntado -> usuário aceitou -> sessão iniciada
                         -> usuário recusou -> setup mensal liberado
```

Hoje o sistema mistura “acabei de perguntar” com “usuário recusou”.

### 2. Não limpar D0 no turno em que a Aura apenas fez o convite

Quando o backend injeta o contexto “pergunte se topa abrir a primeira sessão agora”, ele deve manter `pending_first_session_invite=true` até a próxima mensagem do usuário.

A limpeza só deve acontecer quando houver uma resposta real ao convite.

### 3. Tratar “Sim”, “Bora”, “Ok”, “Pode ser” como aceite D0 quando vierem após o convite

A regra de clique curto deve continuar existindo para não queimar o welcome, mas não pode bloquear aceite depois que a Aura já perguntou explicitamente pela sessão.

Critério seguro:

- Se a última resposta da Aura contém convite D0 (“topa abrir sua primeira sessão”, “45 minutos”, “agora mesmo”), então mensagens curtas como `sim`, `bora`, `ok`, `pode ser`, `vamos` são aceite real.

### 4. Iniciar a sessão deterministicamente no aceite, sem depender do LLM emitir tag

No aceite D0:

- criar sessão D0 para agora;
- marcar `status='in_progress'`;
- preencher `started_at`;
- setar `current_session_id` no perfil;
- incrementar `sessions_used_this_month`;
- limpar `pending_first_session_invite` e tentativas;
- manter `needs_schedule_setup=false` nesse momento;
- injetar contexto na resposta seguinte dizendo que a sessão terapêutica começou.

Isso remove a dependência frágil de o modelo lembrar de emitir `[AGENDAR_SESSAO]`.

### 5. Só liberar setup mensal após recusa real

`needs_schedule_setup=true` só deve ser ativado se:

- o convite D0 já foi perguntado;
- a resposta do usuário for recusa ou não-agora;
- não houve aceite nem criação de sessão imediata.

Assim evitamos o mensal aparecer enquanto o D0 ainda está em aberto.

### 6. Cobrir com testes de regressão

Adicionar testes para estes cenários:

- primeira mensagem real após welcome: Aura pergunta D0 e mantém estado ativo;
- usuário responde “Sim”: sessão D0 inicia imediatamente;
- usuário responde “Bora”: sessão D0 inicia imediatamente;
- usuário responde “agora não”: D0 limpa e setup mensal fica disponível;
- mensagem curta de botão antes do convite não queima D0;
- agenda mensal não roda antes da resposta ao convite D0.

### 7. Reparar o caso Ernestina separadamente

Depois da correção, recomendo reparar esse caso manualmente:

- criar retroativamente a sessão D0 concluída com base na janela real da conversa;
- rodar o extractor para salvar resumo, temas, insights e compromissos;
- decidir se enviaremos rating retroativo ou se apenas preservamos a memória para a sessão de quarta.

Essa reparação é separada da correção do bug para não misturar dado histórico com regra de sistema.