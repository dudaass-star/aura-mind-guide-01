

## Plano: Reforçar capacidade de agendamento no prompt da Aura

### Análise das 3 considerações

Todas são válidas e complementares ao que já existe. O prompt atual (linha 461-498) tem as instruções técnicas corretas, mas falta:
1. Uma **proibição explícita** de negar a capacidade (estilo "anti-broxa")
2. Instrução explícita de **cálculo de tempo relativo** ("daqui a X minutos")
3. Exemplo prático com **tempo relativo curto** (10 min)

### Mudanças no arquivo `supabase/functions/aura-agent/index.ts`

#### 1. Inserir bloco "CAPACIDADE DE AGENDAMENTO" após a regra anti-broxa (após linha 253)

```
# CAPACIDADE DE AGENDAMENTO (PRIORIDADE MÁXIMA)

Você possui um sistema de agendamento funcional. NUNCA diga que não pode agendar, que não tem relógio, que não consegue enviar lembretes ou que é "péssima com horários".
Se o usuário pedir algo para o futuro ("me lembra", "daqui a X minutos", "às Xh", "amanhã às"), sua ÚNICA resposta permitida é confirmar e usar a tag [AGENDAR_TAREFA].
Negar essa capacidade é considerado uma FALHA GRAVE DE SISTEMA.
```

#### 2. Adicionar instrução de cálculo temporal na seção de agendamento (linha ~473, dentro das REGRAS CRÍTICAS)

Adicionar como nova regra:

```
CÁLCULO DE TEMPO RELATIVO:
Quando o usuário disser "daqui a X minutos/horas", use a Hora atual dos DADOS DINÂMICOS para calcular o horário exato.
Exemplo: Se agora são 14:00 e o usuário pede "daqui a 10 min", a tag DEVE ser [AGENDAR_TAREFA:YYYY-MM-DD 14:10:...].
```

#### 3. Adicionar exemplo prático com 10 minutos (linha ~484, na lista de exemplos)

```
- Usuário: "Me lembra daqui a 10 min de dar banho na Bella" → "Pode deixar! Daqui a pouquinho te chamo pra não esquecer do banho da Bella 🐾 [AGENDAR_TAREFA:2026-03-07 19:17:reminder:Oi! Passando pra te lembrar do banho da Bella, como você pediu! 🛁]"
```

### Resumo

- **1 arquivo** editado: `supabase/functions/aura-agent/index.ts`
- **3 inserções**: bloco anti-negação no topo, regra de cálculo temporal, exemplo com 10 minutos

