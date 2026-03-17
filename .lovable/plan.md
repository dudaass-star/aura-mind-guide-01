

## Análise: Novo Protocolo de Segurança — Critério Cirúrgico

### Veredicto: Implementar. É melhor que o atual em todos os aspectos.

---

### O que melhora

**1. Clareza brutal nos exemplos do Nível 2.** O protocolo atual diz "plano concreto COM método definido" mas dá poucos exemplos. O novo lista 7 exemplos de ativação e 4 exemplos do que NÃO ativa. Isso reduz ambiguidade para o modelo — LLMs respondem melhor a exemplos concretos do que a regras abstratas.

**2. A frase "Mesmo que a pessoa não tenha nenhum suporte profissional — FIQUE COM ELA"** resolve exatamente o caso da Vera. O modelo atual tem um bias forte de "safety net" — quando detecta que a pessoa não tem psicólogo, ele tende a sugerir. Essa frase fecha essa porta explicitamente.

**3. Estrutura mais limpa.** O atual mistura conceitos (1, 1.5, 2, 3). O novo tem 3 níveis claros e sequenciais. Menos carga cognitiva para o modelo = menos erros.

**4. A proibição explícita de "fale com alguém"** é importante. O protocolo atual proíbe "CVV" e "ajuda profissional" mas não cobre variações como "conversa com alguém de confiança" — que o modelo usa como escape.

### Uma sugestão de ajuste

O protocolo novo remove **"surto psicótico"** e **"violência física/abuso sexual"** do Nível 2. O atual os tem. Recomendo manter pelo menos violência/abuso como gatilho de emergência — são cenários reais onde encaminhamento é necessário e a Aura genuinamente não pode ajudar.

Sugiro adicionar ao Nível 2:
```
- "Ele tá me batendo agora" / "Estou trancada e ele não me deixa sair"
- Violência física em curso ou abuso sexual ativo
```

### Plano de implementação

**Arquivo:** `supabase/functions/aura-agent/index.ts`

**Mudança única:** Substituir linhas 443–483 (protocolo atual completo) pelo novo texto proposto, com o ajuste de violência/abuso adicionado ao Nível 2.

**Deploy:** Redeploy `aura-agent`.

Sem migração de banco. Sem mudança de código. Pura substituição de prompt.

