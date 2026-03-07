

## Ajuste no Prompt do Efeito Oráculo

### Problema Identificado

O prompt atual permite que a IA combine temas desconectados (ex: "treinos" + "paciência com filha" → "mindfulness para exercício"). O resultado soa genérico e artificial.

### Solução

Refinar as instruções no `AURA_MINI_PERSONA` dentro de `pattern-analysis/index.ts`:

1. **Adicionar regra anti-combinação artificial**: instruir a IA a focar em UM insight específico e concreto, sem misturar categorias desconectadas
2. **Priorizar sugestões acionáveis**: preferir "faça X hoje" em vez de conceitos abstratos como "mindfulness"
3. **Usar detalhes pessoais como âncora**: se sabe o sorvete favorito, o horário de treino, um hobby — usar isso como gancho para parecer genuíno
4. **Melhorar a instrução de SKIP**: se os insights são vagos demais para algo concreto, melhor SKIP do que uma sugestão forçada

### Mudança

Editar apenas o `AURA_MINI_PERSONA` e o `userPrompt` em `supabase/functions/pattern-analysis/index.ts`:

- Adicionar: "Foque em UM único insight concreto. Não combine temas desconectados."
- Adicionar: "Use detalhes pessoais específicos (nome de pessoa, comida favorita, horário preferido) como âncora da sugestão."
- Adicionar: "Prefira sugestões práticas e acionáveis ('que tal X hoje?') em vez de conceitos abstratos ('pratique mindfulness')."
- Reforçar: "Se não conseguir algo genuinamente específico e natural, retorne SKIP."

