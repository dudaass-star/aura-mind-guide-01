# Fechamento de sessão: relógio vira backstage, fechamento vira aceite

## Diagnóstico (confirmado na investigação anterior)

Hoje existem DOIS "fechadores duros" que podem cortar uma sessão boa:

1. **Safety net no `aura-agent`**: em fase `overtime`, TODA mensagem da Aura que não seja pergunta recebe `[ENCERRAR_SESSAO]` à força — mesmo que o prompt diga "se o usuário quiser continuar, continue". Prompt e código se contradizem.
2. **Cron no `session-reminder`**: fecha a sessão no fim previsto + 30 min, mesmo se o usuário falou há 2 minutos (38 de 59 sessões recentes foram fechadas com mensagem do usuário nos 4 min anteriores).

E o prompt ainda manda a Aura falar do relógio ("faltam 10 min") e entregar micro-passo sem confirmar — caso exato da Diana (nota 3).

## Princípio do plano

Quanto menos decisão o modelo precisar tomar, menos ele erra. Então:

- O **modelo** só faz 2 coisas: conduzir a conversa e propor o fechamento UMA vez quando o código sinalizar.
- O **código** (determinístico, não erra) decide quando a sessão morre: silêncio real do usuário ou despedida detectada.

## Mudanças

### 1. Prompt: proibir falar do relógio (aura-agent)

- Nas fases `transition`, `soft_closing`, `final_closing` e `overtime`, remover as linhas "Faltam X min" e adicionar regra única: **"NUNCA mencione minutos, tempo restante ou relógio para o usuário."**
- O tempo continua existindo internamente para o código — só sai da fala da Aura.

### 2. Prompt: regra única de fechamento (aura-agent)

Substituir as instruções longas e divergentes das fases finais por UMA regra curta, repetida igual em todas:

- "Quando o sistema indicar que o tempo está perto do fim, proponha encerrar UMA vez, com naturalidade (sem falar de minutos)."
- "Se o usuário aceitar ou se despedir, feche com presença e emita `[ENCERRAR_SESSAO]`."
- "Se o usuário continuar trazendo conteúdo, continue a sessão normalmente. Não proponha de novo."

### 3. Prompt: proposta de ação só com aceite (aura-agent)

- Antes de fechar com micro-passo/âncora, confirmar com o usuário ("topa tentar isso essa semana?").
- Sem aceite claro: fechar só com presença, sem ação — ou continuar a conversa.

### 4. Código: safety net respeita o aceite (aura-agent, ~15 linhas)

- Em `overtime`, a safety net passa a forçar `[ENCERRAR_SESSAO]` apenas quando a mensagem tem sinal de despedida (mesma regra das outras fases) — elimina a contradição prompt × código.
- A trava de "turno aberto" (relato ≥160 chars / "não sei") passa a valer também em overtime.
- Mantém o bloqueio de encerramento em fases iniciais (inalterado).

### 5. Código: cron só fecha com silêncio real (session-reminder, ~20 linhas)

- O fechamento por abandono passa a exigir **inatividade real**: última mensagem do usuário com pelo menos 15 min de silêncio.
- Se o usuário falou há pouco, o cron adia e re-verifica no próximo ciclo (o cron roda a cada 5 min) — nunca corta sessão viva.
- Classificação `no_show` (0–4 msgs) e fallback de resumo/rating continuam iguais.

### 6. Código: teto absoluto de duração (trava de segurança obrigatória)

Sem isso, as mudanças 4 e 5 permitem uma sessão que **nunca fecha** enquanto o usuário fala. Então:

- Teto duro de **2× a duração prevista** (90 min numa sessão de 45). Ao cruzar o teto, a Aura recebe instrução para fechar no próximo turno e o código força `[ENCERRAR_SESSAO]` — sem exceção de turno aberto.
- Teto de segurança no cron: sessão `in_progress` há mais de **4 horas** é fechada independente de atividade.
- Guarda contra sessão órfã duplicada: a busca por sessão órfã usa `.maybeSingle()` e quebra se houver duas `in_progress`. Trocar por ordenação + `limit(1)`.


### O que NÃO muda

- Estrutura de fases e cálculo de tempo (mecânica interna intacta).
- Cron de abandono continua existindo como backstop — só ganha o critério de silêncio.
- Travas já implantadas (gate `is_responding`, despedida imune a interrupção) permanecem.
- Zero migração de banco, zero tabela nova, zero função nova.

## Arquivos

| Arquivo | Tipo de mudança |
|---|---|
| `supabase/functions/aura-agent/index.ts` | Textos de prompt (fases finais) + ajuste na safety net |
| `supabase/functions/session-reminder/index.ts` | Critério de silêncio no fechamento por abandono |

## Validação

1. Rodar os testes unitários de sessão existentes e ajustar os que dependem do comportamento antigo.
2. Deploy manual das 2 functions (`aura-agent` e `session-reminder`) — drift Lovable→GH Actions é risco conhecido.
3. Em até 10 min após o deploy, checar `failed_message_log` por erros novos.
4. Na próxima sessão real, verificar no admin: sem fala de relógio, sem fechamento sem aceite, e sessão viva não cortada pelo cron.
5. Acompanhar por 1 semana: notas das sessões e flags `clock_muleta_acionado` / `fechamento_forcado_sem_material` nas análises de cobertura — meta é essas flags sumirem.

## Riscos verificados no código e no banco

**Risco alto — sessão que nunca fecha (resolvido pela mudança 6).**
Sem teto, uma sessão `in_progress` eterna causa efeitos em cadeia confirmados no código: toda conversa casual seguinte continua em modo sessão com fases profundas (`aura-agent:5428`), a cota mensal já foi consumida no início mas nunca gera resumo nem nota, o follow-up de conversa fica suprimido e a busca por sessão órfã pode quebrar. O banco já mostra sessões de até 373 min. Por isso o teto de 2× e o corte de 4h no cron são obrigatórios, não opcionais.

**Risco médio — usuário surpreendido pelo fim.**
Tirar "faltam 10 min" pode fazer a sessão terminar sem aviso. Mitigado: a Aura continua propondo o fechamento uma vez, só sem números — "acho que a gente pode fechar por aqui hoje, o que você acha?". O sinal existe, muda só a forma.

**Risco médio — nota chega mais tarde.**
Com o critério de silêncio, o resumo e a nota saem até 15–20 min depois do último turno em vez de imediatamente. O cron roda a cada 5 min e o `dispatchPostSession` já espera a Aura terminar de falar, então o pedido de nota continua coerente — mas chega mais frio. Aceitável frente ao ganho de não cortar sessão viva.

**Risco baixo — cota mensal.**
Verificado: `sessions_used_this_month` é incrementado no início da sessão, não no fim. Sessão mais longa não consome cota extra.

**Risco baixo — encerramento explícito do usuário.**
Verificado: `wantsToEndSession` e `wantsToPauseSession` seguem intactos. Se o usuário disser que quer parar, encerra na hora, independente de fase.

**Sem risco de regressão nas travas atuais.**
Gate de `is_responding`, despedida imune a interrupção e bloqueio de encerramento em fases iniciais permanecem sem alteração.

## Efeito esperado na qualidade

O que degrada hoje é fechar antes do material amadurecer — 8 de 19 sessões analisadas tiveram flag de tempo, com média automática 3,50 contra 4,45 nas demais. As mudanças removem o gatilho de relógio e mantêm todos os freios contra sessão infinita. Sessões `dialogada` já rodam em 48 min de média, ou seja: quando o fechamento é negociado, ele acontece naturalmente perto do tempo previsto — sem precisar de corte forçado.

