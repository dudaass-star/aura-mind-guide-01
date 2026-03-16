

# Implementação das 4 Reescritas no System Prompt do aura-agent

## Resumo

4 alterações no `AURA_STATIC_INSTRUCTIONS` em `supabase/functions/aura-agent/index.ts`:

### Reescrita 1 -- Timer Emocional (linha 330)
**Substituir** a linha 330 (`Seu foco: O usuário te procurou porque confia em você. Entregue CONEXÃO primeiro, depois clareza.`) pelo bloco completo com a nova hierarquia e a REGRA DO TIMER EMOCIONAL (turnos 1/2/3+).

### Reescrita 2 -- Modo Direção (linhas 901-903)
**Substituir** o Cenário B (3 linhas) pelo protocolo completo com as 4 etapas: Nomeie o Travamento, Micro-passo Inegociável, Cobrança com Data (conectada ao sistema de follow-up), Resistência (conectada à detecção recorrente). Inclui exemplos de frases.

### Reescrita 3 -- Detecção de Travamento Recorrente (após linha 821)
**Inserir nova seção** entre o bloco "DETECÇÃO DE PADRÕES (ESPELHO)" e "ESTRUTURA DA RESPOSTA". Cobre padrões de inação recorrente com protocolo progressivo (1a vez, 2a vez, 3a+ vez com confronto direto).

### Reescrita 4 -- Modo Padrão (linhas 909-911)
**Substituir** o Cenário D (3 linhas) pelo protocolo em 3 tempos: Entenda o que a pessoa quer (classificar internamente como DESABAFAR/DECIDIR/MOVER), Entregue valor real, Feche com intenção.

### Também remover (linha 913)
A "REGRA DE OURO" com a pergunta `"Você quer que eu te ajude a pensar nisso ou quer uma ideia prática pra agir agora?"` -- pois o novo Modo Padrão já resolve isso internamente sem perguntar ao usuário.

### Impacto estimado
- Linhas removidas: ~10
- Linhas adicionadas: ~109
- Aumento líquido: ~99 linhas (~600 tokens)
- Prompt total estimado: ~6000 tokens (ainda bem dentro dos limites)

