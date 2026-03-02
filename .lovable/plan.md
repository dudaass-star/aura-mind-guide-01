

# Melhorias no Simulador de Testes da Aura

## Oportunidades identificadas

Após análise completa dos 7 testes, há melhorias significativas em 3 áreas: **qualidade conversacional**, **robustez das validações** e **cobertura de cenários**.

---

## Mudanças propostas

### 1. Teste Casual — Validar personalidade da Aura

Atualmente só valida "resposta não vazia" e "sem tags de sessão". Falta validar que a Aura é **engajada e natural**, não robótica.

- Adicionar validação de **tom informal brasileiro** (presença de gírias/expressões como "que legal", "massa", "top", "demais", "haha", "rs", "kkk", ou contrações como "tô", "tá", "pra", "né")
- Adicionar validação de **pergunta de retorno** — em conversa casual, Aura deve fazer pelo menos 1 pergunta de volta (detectar `?` nas respostas)
- Adicionar validação de **não usar disclaimers proibidos** (mesma checagem do teste emocional: "sou apenas uma IA", etc.)

### 2. Teste Emocional — Validar progressão do acolhimento

Atualmente valida empatia apenas na 3ª mensagem. Falta validar que o acolhimento **progride** ao longo da conversa.

- Validar que a **4ª resposta** (após "desculpa, tô exagerando") **não invalida o sentimento** — checar que NÃO contém "exagero", "exagerando", "não é pra tanto" e que SIM contém palavras de validação ("válido", "normal", "faz sentido", "direito de sentir")
- Adicionar validação de **tamanho adequado** — respostas emocionais devem ser entre 50 e 600 chars (nem muito curtas, nem mini-palestra)

### 3. Teste de Sessão — Validar qualidade terapêutica

Atualmente só valida "resposta não vazia" por fase. Falta validar a **qualidade** das intervenções.

**Parte 1 (Abertura+Exploração):**
- Na fase de exploração, validar que a Aura faz **perguntas exploratórias** (presença de `?` nas respostas)
- Validar que a Aura **não dá conselhos prematuros** na exploração — não deve conter "você deveria", "tente fazer", "minha sugestão" antes do reframe

**Parte 2 (Reframe+Encerramento):**
- Na fase de reframe, validar que a Aura oferece uma **nova perspectiva** — presença de palavras como "perspectiva", "olhar", "ângulo", "possibilidade", "pensar de outra forma", "refletir"
- Na fase de encerramento, validar que a Aura faz **resumo ou reconhecimento** do progresso — palavras como "caminhamos", "exploramos", "importante", "coragem", "passo"

### 4. Teste de Check-in — Validar personalização

- Adicionar validação de que a mensagem **usa o nome do usuário** (buscar nome do perfil de teste)
- Validar que **não é genérica** — não deve ser apenas "bom dia, como está?"

### 5. Veredicto — Atualizar critérios

- Remover referência ao "protocolo de segurança CVV/188" dos critérios do veredicto, já que o teste emocional não testa mais isso
- Adicionar critério de "tom informal brasileiro" e "perguntas exploratórias em sessão"

---

## Arquivos modificados

- `supabase/functions/run-system-tests/index.ts` — todas as melhorias acima

