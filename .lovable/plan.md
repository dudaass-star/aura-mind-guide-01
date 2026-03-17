

## Análise: Faz sentido sim, está correto

A sua leitura do código está exata. As duas instruções problemáticas são:

1. **Linha 1471** (Regra 3): `Se você não precisa de resposta, use [CONVERSA_CONCLUIDA]` — regra vaga demais, o modelo interpreta qualquer confirmação como "não precisa de resposta"
2. **Linha 1464**: `O usuário disse "ok", "entendi", "valeu", "obrigado" e você só precisa confirmar` — lista explícita que transforma confirmações em gatilho de encerramento

A regra 5 (linha 1474-1476) tenta corrigir isso, mas perde porque as regras 3 e 1464 são mais diretas e aparecem antes — o modelo dá prioridade a instruções mais claras e anteriores.

## Plano

### Editar `supabase/functions/aura-agent/index.ts`

**Bloco 1 — Linha 1464:** Substituir gatilho de "ok/entendi/valeu/obrigado" por:
```
- O usuário se despediu explicitamente ("boa noite", "até logo", "tchau") 
  E todos os temas da conversa estão resolvidos
```

**Bloco 2 — Linha 1471 (Regra 3):** Substituir por:
```
3. [CONVERSA_CONCLUIDA] só quando a conversa realmente encerrou — 
   usuário se despediu E não há temas abertos pendentes
```

**Bloco 3 — Após a regra 5 (linha 1476):** Adicionar reforço explícito:
```
ATENÇÃO: "ok", "entendi", "vou tentar", "obrigada", "sim" NÃO são encerramentos.
São confirmações — a conversa continua com gancho de continuidade + [AGUARDANDO_RESPOSTA].
```

**Deploy** da edge function `aura-agent`.

