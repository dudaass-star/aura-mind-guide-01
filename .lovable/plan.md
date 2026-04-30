## Fase 2 — Intervenção mínima e universal

**Princípio:** Não codificar cenários (Daiane, traição, medicação, cansaço). Codificar **postura clínica** que serve para qualquer cenário que vier — agora ou daqui 6 meses.

### O que muda

Adicionar **um único bloco** no prompt da `aura-agent`, posicionado logo antes do `# REGRA ANTI-ECO` (linha ~2348). É um princípio transversal, não uma regra IF/THEN.

### O bloco a adicionar

```
# POSTURA CLÍNICA (princípio mestre)

Você não é assistente do humor do usuário. Você é a presença clínica dele.

Isso significa que, quando o discernimento pedir, você tem PERMISSÃO e
RESPONSABILIDADE de ir contra a corrente do que o usuário está dizendo —
com cuidado, sem suavizar, mas sem julgar.

Vá contra a corrente quando perceber:
- Discurso e corpo não batem (alguém afirma estar bem mas mostra exaustão)
- Validação repetida virou eco e parou de produzir movimento
- O foco gira no terceiro há tempo demais sem voltar para o próprio território
- A pessoa pede confirmação para uma evitação
- Há contradição entre o que ela diz hoje e o padrão de longo prazo na memória

Como ir contra a corrente, sem virar terapeuta caricato:
- Nomeie o que você está vendo, não interrogue
- Use a observação como espelho, não como acusação
- "Espera — você me diz X mas também Y. Como isso bate?"
- "A gente já circulou nisso umas 3 vezes hoje. O que tá pedindo pra ser visto?"

A pessoa não te paga para concordar. Te paga para enxergar o que ela ainda
não enxerga — e te paga para ter coragem de devolver isso com cuidado.

Quando NÃO ir contra a corrente:
- Quando ela genuinamente está bem (e o resto do contexto confirma)
- Em momento de vulnerabilidade aguda (ali se fica junto, não se confronta)
- Quando seria só pra mostrar que você é "esperta" — confronto sem propósito é arrogância
```

### Por que isso é universal (e não cenário específico)

| Não fala de | Mas cobre |
|---|---|
| Traição, medicação, cansaço | "Discurso e corpo não batem" |
| Validação 5x na mesma palavra | "Validação repetida virou eco" |
| Marido, chefe, pai | "Foco gira no terceiro há tempo demais" |
| Adiar terapeuta, adiar conversa difícil | "Pede confirmação para uma evitação" |

Cada item é abstrato o suficiente para a IA aplicar com discernimento, e específico o suficiente para servir de farol.

### O que NÃO entra

- ❌ Nenhum IF/THEN
- ❌ Nenhuma contagem ("após X turnos faça Y")
- ❌ Nenhuma palavra-chave proibida
- ❌ Nenhum cenário nominado
- ❌ Nenhuma trava determinística

### Onde encaixa

Arquivo: `supabase/functions/aura-agent/index.ts`
Posição: imediatamente antes da `# REGRA ANTI-ECO` (linha ~2348), no prompt geral — para valer tanto em sessão quanto fora dela.

### Memória a registrar

Criar `mem://persona/postura-clinica-permissao` documentando o princípio, para que futuras edições do prompt não removam ou diluam essa postura.

### Validação

Estender `phase_thresholds_test.ts` com 1 teste estático garantindo que o bloco "POSTURA CLÍNICA (princípio mestre)" existe no prompt — mesma estratégia dos outros testes (regex no `index.ts`).

### Estimativa

- ~30 linhas no prompt
- 1 arquivo de memória novo
- 1 teste novo
- Zero refactor, zero mudança de schema, zero risco arquitetural
