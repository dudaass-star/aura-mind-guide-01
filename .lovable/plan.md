

# Avaliação: A consideração faz sentido?

## Veredicto: Faz sentido como princípio, mas já está coberta pelo plano atual.

A preocupação é legítima — um early return que desliga o evaluator **antes** da verificação de crise seria um bug grave. Porém, olhando o código real, o plano já está correto:

### Ordem atual do `evaluateTherapeuticPhase` (linhas 862-1086):

```text
L862  → Priority 1: CRISE (crisis/vulnerable) → return forçando presença ✅
L877  → Priority 2: Short answer streak (detecta, não retorna ainda)
L884  → Priority 3: TOPIC SHIFT → return resetando estagnação ✅
L891  → Priority 4: RESISTÊNCIA → return cancelando avanço ✅
L903  → Fim dos overrides de contexto

L905-950 → Detecção de fase (keyword/semantic)
L952-1023 → SESSION MODE (se sessão ativa)

L1026 → ======== FREE CONVERSATION ======== ← AQUI entra o early return
```

O plano propõe o early return **na linha 1026** (início de FREE CONVERSATION), que é **depois** de todas as verificações de segurança (crise L862, topic shift L884, resistência L891).

### Conclusão

A consideração está **correta como princípio de segurança**, mas **não requer mudança no plano** — o posicionamento já respeita a hierarquia:

1. ✅ Crise (Priority 1) — L862
2. ✅ Topic Shift (Priority 2/3) — L884  
3. ✅ Resistência (Priority 4) — L891
4. ✅ **[NOVO]** Early return novo usuário — L1026
5. ✅ Estagnação normal (5+ trocas) — L1039

O plano pode prosseguir sem alteração. A observação serve como checklist de QA na implementação.

