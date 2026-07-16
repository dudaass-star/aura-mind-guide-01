
# Aterrissagem de sessão sem corte artificial

## Problema que estamos tratando

Auditoria das últimas 30 sessões mostrou distribuição bimodal do fim: ou fecha em ~45min (ideal), ou arrasta pra ~78min (ruim). Em 25% dos casos vira `no_show` — cron externo mata sem despedida, taxa de retorno em 72h cai pra 12,5%. Em 100% das sessões silenciosas a Aura foi a última a falar, tipicamente com pergunta aberta densa. Cliente sai com sensação de "fiquei pendurado" ou "ela não sabe fechar".

Causa raiz encontrada no código do `aura-agent/index.ts`:

1. A "Rede de Segurança de Fechamento" (linha 1389) tem 4 pré-condições AND — incluindo `auraAskedCommitment`, que é chicken-and-egg. Praticamente nunca dispara.
2. As fases tardias (`soft_closing`, `final_closing`, `overtime`) não têm bloco de guidance no evaluator — a Aura passa dos 45min sem receber nenhuma orientação nova de fechamento.
3. Rotas de continuidade (`session_bridge`, `suggest_session`) existem mas não são referenciadas nos momentos em que fariam diferença.

Não é problema do modelo Flash e nem de timer — é buraco de cobertura no evaluator que já roda.

## O que muda para o cliente

- Sessão sempre termina com aterrissagem (um dos 7 formatos do Cardápio).
- Nunca é cortado no meio de assunto novo com carga emocional.
- Se pedir para continuar após proposta de fechar, é acolhido por até ~15min extras.
- Fim vira convite pra próxima sessão ou check-in — não vácuo.

## O que NÃO muda

- Nenhum timer paralelo ao Phase Evaluator.
- Nenhum hard-cut de tempo dentro do agente.
- Nenhum "vamos parar por aqui" seco.
- Duração alvo continua 45min; cron externo continua sendo o único que fecha no banco.
- Metodologia (logoterapia, 3 fases, Cardápio) intocada.

## Escopo técnico

Todas as mudanças em uma única função: `evaluateTherapeuticPhase` em `supabase/functions/aura-agent/index.ts`. Nada em paralelo, uma única fonte de decisão.

### 1. Afrouxar a Rede de Segurança existente

Remover a exigência de `auraAskedCommitment` da condição de disparo (é chicken-and-egg). Manter: `sentido sustentado + elapsed ≥ 60%`. Manter `user_engaged_with_commitment` como razão de desarme (já funciona).

### 2. Adicionar guidance para fases órfãs

Preencher blocos de instrução tática para `soft_closing` (~38min+) e `overtime` (~45min+) — hoje ambos ficam sem nenhuma injeção. Texto de cada bloco inclui:

- Estado "costurando" (`soft_closing`): "sem novas perguntas exploratórias; aprofunde o que já está na mesa e comece a puxar o fio para o Cardápio."
- Estado "aterrissando" (`overtime`): "o formato do Cardápio precisa emergir nesta ou na próxima resposta; priorize `session_bridge` / `suggest_session` para transformar o fim em próximo capítulo."

### 3. Salvaguarda contra corte de assunto vivo

Regra escrita explicitamente nos dois blocos acima:

> "Se o usuário abriu tema novo com carga emocional na última mensagem, NÃO force fechamento. Acolhe, valida, e proponha retomar na próxima sessão. Fechar em cima de assunto vivo parece robô."

### 4. Acolher pedido de continuar

Nova flag determinística no evaluator: `user_declined_closure = true` quando a última mensagem do usuário vier após uma resposta da Aura marcada com fechamento (menção a "próxima sessão"/"retomar" ou tag `session_bridge`/`suggest_session`).

Enquanto essa flag estiver ativa por até 3-4 pares de mensagens (ou +15min sobre o alvo, o que vier primeiro), o evaluator **suprime** as instruções de aterrissagem e injeta:

> "Usuário pediu para continuar após proposta de fechar. Acolhe integralmente o que ele trouxe; NÃO repita proposta de fechar imediatamente. Só volte a costurar quando o novo tema tiver sido tocado."

Passando desse limite, evaluator volta a injetar aterrissagem, agora com texto de validação: *"a gente estendeu bem hoje, e o que você trouxe merece espaço próprio — que tal marcarmos [dia]?"*.

Teto absoluto continua sendo o cron externo.

## Instrumentação (já existe, só validar)

- `closure_mode` no `sessions` (deployado hoje). Após 24-48h deve começar a aparecer preenchido com `ritual` / `unilateral` / `no_show`.
- Se continuar 100% NULL depois desse prazo, abrir sub-tarefa de investigação — fora do escopo deste plano.

## Métricas de sucesso (30 dias após deploy)

- % de sessões com `closure_type` preenchido dentro de ≤50min sobe de ~45% para ≥65%.
- % de `no_show` cai de ~25% para ≤10%.
- Taxa de retorno em 72h nas sessões que passam do alvo sobe de 12,5% para ≥30%.
- Duração média cai de ~62min para ≤52min.

## Arquivos afetados

- `supabase/functions/aura-agent/index.ts` — única mudança, dentro de `evaluateTherapeuticPhase` e nos textos de `SESSION_PHASE_INSTRUCTIONS`.

## Riscos e mitigação

- **Risco**: Aura ficar rígida demais e cortar cedo. **Mitigação**: salvaguarda de assunto vivo + flag `user_declined_closure` são explícitas no prompt.
- **Risco**: Flash ignorar as novas instruções como ignora as atuais. **Mitigação**: instruções ficam mais fortes e cobrem fases hoje órfãs (mudança de cobertura, não só de tom). Se ainda assim ignorar, próximo passo seria interceptação determinística no backend — mas só depois de validar que a mudança de cobertura já resolve boa parte.
- **Risco**: Regressão no comportamento atual das sessões que já fecham bem (~45%). **Mitigação**: mudanças concentradas nas fases tardias; `exploration`/`reframe` intocados.
