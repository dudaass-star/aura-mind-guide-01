

# Análise: Fases Sentido e Movimento estão funcionando bem?

## Resultado: Sim, estão bem implementadas

### Fase 2 — Sentido (Busca de Significado)

**Trigger**: Ativa quando a Aura fica 7+ trocas em Presença sem avançar.

**O que faz quando ativa**:
- Injeta instruções táticas com exemplos de Certo/Errado
- Proíbe perguntas exploratórias ("me conta mais", "como assim")
- Obriga a trazer UMA observação profunda + UMA pergunta-âncora da Logoterapia
- Exemplos: "O que essa situação mostra sobre o que importa pra você?" / "Quem você quer ser do outro lado disso?"

**Safeguard**: Se o usuário entra em crise ou vulnerabilidade durante Sentido, o sistema reseta para Presença automaticamente.

**Avaliação**: Bem implementada. O threshold de 7 trocas dá espaço suficiente para exploração sem ficar preso.

---

### Fase 3 — Movimento (Ação com Sentido)

**Trigger**: Ativa quando a Aura fica 8+ trocas em Sentido sem avançar.

**O que faz quando ativa**:
- Proíbe continuar "filosofando" sem ação
- Extrai compromisso DO usuário (não dá conselho)
- Regra de ouro implementada: "Ação sem sentido não sustenta"
- Exemplo: "Se você pudesse mudar UMA coisa pequena essa semana, o que faria sentido?"

**Safeguard**: Mesma proteção de crise/resistência — se detectado, volta para Presença.

**Avaliação**: Bem implementada. A regra de ouro protege contra conselhos prematuros.

---

### Resumo dos safeguards (todas as fases)

| Situação | Ação automática | Status |
|----------|----------------|--------|
| Crise/vulnerabilidade | Reset para Presença | ✅ |
| Mudança de tema | Reset + guidance de mapeamento | ✅ |
| Resistência/desengajamento | Cancela avanço, valida | ✅ |
| Respostas curtas (2+ turnos) | Nudge para ângulo mais leve | ✅ |
| Sessão > 20min com sentido natural | Transição para fechamento | ✅ |

---

### Único problema: Presença sem freio de saída

As fases 2 e 3 têm triggers para **forçar avanço** quando a Aura fica presa demais (7 e 8 trocas). Mas não existe o inverso — nada impede a Aura de **pular** Presença e ir direto para Sentido na primeira resposta.

Esse é o ajuste que já discutimos: adicionar o "freio de Presença" para garantir no mínimo 4 trocas antes de permitir avanço.

Fora isso, as fases 2 e 3 estão sólidas.

