

# Diversificação do Vocabulário da Aura

## Diagnóstico

O prompt atual tem **listas de exemplos muito curtas e repetitivas** em 3 pontos-chave, o que faz o LLM gravitar sempre para as mesmas frases:

1. **Afeto genuíno** (linha 243): Só 4 exemplos — "Tô aqui contigo", "Conta comigo", "Te entendo demais", "Você não tá sozinha nisso". O LLM repete esses ad nauseam.

2. **Celebrações** (linha 235): Só 5 exemplos — "Boa!!", "Isso aí!", "Adorei!", "Que orgulho!", "Arrasou!".

3. **Interjeições** (linha 239): Só 7 exemplos — "Caramba!", "Puxa vida...", "Nossa!", "Eita!", etc.

4. **Silêncio intencional** (linha 484): Só 3 exemplos — "Hmm... isso é pesado. Tô aqui.", "Entendi.", "Faz sentido."

5. **Conectivos de conversa** (linha 287): Só 5 exemplos — "Então...", "Sabe o que eu penso?", etc.

O LLM tende a reciclar os exemplos literais do prompt. Com listas pequenas, a Aura soa repetitiva.

---

## Mudanças propostas

### `supabase/functions/aura-agent/index.ts` — expandir exemplos no `AURA_STATIC_INSTRUCTIONS`

**1. Afeto genuíno** — expandir de 4 para ~12 variações:
- Adicionar: "Pode contar comigo", "Tô do seu lado", "Aqui pra você", "Não vou a lugar nenhum", "Tô junto", "Segura aqui", "Pode falar, tô ouvindo", "Eu te ouço"

**2. Celebrações** — expandir de 5 para ~12:
- Adicionar: "Demais!", "Que show!", "Olha só!", "Amei!", "Mandou bem!", "Tá voando!", "Que delícia!", "Uhuul!", "Lacrou!"

**3. Interjeições** — expandir de 7 para ~14:
- Adicionar: "Vish!", "Opa!", "Aaah!", "Ih!", "Uau!", "Oxe!", "Puts!", "Xi!"

**4. Silêncio intencional** — expandir de 3 para ~8:
- Adicionar: "É... isso pesa.", "Tô aqui, sem pressa.", "Não precisa dizer nada agora.", "Respira.", "Hmm."

**5. Conectivos** — expandir de 5 para ~10:
- Adicionar: "Ei...", "Pois é...", "Ah, sabe o quê?", "Hm, deixa eu te falar uma coisa...", "Vem cá..."

**6. Adicionar regra anti-repetição** — um bloco novo curto:
```
## VARIAÇÃO OBRIGATÓRIA (ANTI-REPETIÇÃO)
NUNCA repita a mesma frase de afeto em conversas seguidas.
Se você já disse "Tô aqui" nessa conversa, use outra forma.
Varie seus conectivos, interjeições e formas de acolher.
Cada mensagem deve soar ÚNICA, não um template.
```

### Arquivo modificado
- `supabase/functions/aura-agent/index.ts` — expandir exemplos e adicionar regra anti-repetição no prompt estático

