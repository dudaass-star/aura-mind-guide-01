
Diagnóstico confirmado:
- O fluxo WhatsApp está chegando no backend e chamando o agente corretamente.
- A falha atual não é de deploy/boot: é erro de runtime no `aura-agent`.
- Erro exato nos logs: `ReferenceError: shouldSuggestUpgrade is not defined` em `supabase/functions/aura-agent/index.ts` (durante montagem do `dynamicContext`).
- Isso faz o `aura-agent` cair no catch e retornar fallback: `"Desculpa, tive um probleminha aqui..."`, por isso você não recebe resposta útil.

Plano de correção (hotfix direto):
1. Abrir `supabase/functions/aura-agent/index.ts` e corrigir o bloco onde existe:
   - `if (shouldSuggestUpgrade) { ... }`
2. Definir `shouldSuggestUpgrade` antes desse `if`, usando os dados já calculados:
   - `userPlan`
   - `messagesToday`
   - `planConfig.dailyMessageTarget`
3. Regra sugerida (coerente com o prompt do sistema “acima do target”):
   - `shouldSuggestUpgrade = userPlan === 'essencial' && planConfig.dailyMessageTarget > 0 && messagesToday > planConfig.dailyMessageTarget`
4. Alternativa ainda mais segura (evita nova variável solta): substituir o `if (shouldSuggestUpgrade)` por condição inline com essa mesma regra.

Validação após correção:
1. Publicar `aura-agent`.
2. Ver logs de `aura-agent` e confirmar ausência de `ReferenceError`.
3. Enviar mensagem real no WhatsApp (“Oi Aura”) e confirmar resposta normal (não fallback de erro).
4. Rodar `/admin/testes` (mínimo: casual, emotional, session_part1, session_part2) para validar regressão.

Blindagem imediata para não repetir:
- Fazer varredura rápida no `aura-agent` por variáveis usadas em `if (...)` sem declaração local próxima (mesmo padrão que causou `audioSessionContext`, `sessionAudioCount` e agora `shouldSuggestUpgrade`).
- Padronizar nome de variáveis de contexto com sufixo (`...ForContext`) e manter variáveis operacionais separadas.
