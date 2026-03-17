

## Plano: Limpar Tags Internas Antes de Salvar no Banco

### O Problema

Na linha 5585, a mensagem da assistente é salva na tabela `messages` com apenas timestamps removidos. Mas tags como `[INSIGHTS]...[/INSIGHTS]`, `[AGUARDANDO_RESPOSTA]`, `[CONVERSA_CONCLUIDA]` etc. podem sobreviver até esse ponto — especialmente se o processamento intermediário (linhas 4400-4900) não cobrir todas as tags ou se novas tags forem adicionadas no futuro.

O resultado: o banco tem mensagens poluídas com tags internas, visíveis no painel admin e no histórico de mensagens carregado como contexto.

### A Solução

**Arquivo:** `supabase/functions/aura-agent/index.ts` (~linha 5580)

Substituir a limpeza parcial (só timestamps) por uma limpeza completa que reutiliza a mesma lógica de sanitização já existente nas linhas 2111-2145. Concretamente:

1. **Extrair a lógica de limpeza de tags para uma função reutilizável** (`stripInternalTags`), colocando-a no topo do arquivo (ou próximo às funções utilitárias existentes). Essa função aplica todos os `.replace()` de tags internas que já existem nas linhas 2111-2145.

2. **Usar essa função na linha 5581** para limpar `assistantMessage` antes de salvar no banco, substituindo a limpeza parcial atual.

3. **Usar a mesma função nas linhas 2111-2145** (a limpeza para envio ao WhatsApp), eliminando duplicação de código.

A função `stripInternalTags` ficaria assim em essência:
- Remove `[INSIGHTS]...[/INSIGHTS]`
- Remove `[AGUARDANDO_RESPOSTA]`, `[CONVERSA_CONCLUIDA]`, `[ENCERRAR_SESSAO]`, `[INICIAR_SESSAO]`
- Remove todas as tags de sessão, tema, compromisso, jornada, meditação, upgrade, tarefa, etc.
- Remove timestamps espúrios
- Remove `[COMPROMISSO_LIVRE:...]` (nova tag)
- Trim final

### Impacto
- Banco fica limpo — painel admin mostra só texto real
- Contexto dinâmico (últimas 40 mensagens) não carrega lixo de tags
- Centraliza limpeza num único ponto — novas tags futuras só precisam ser adicionadas em um lugar
- Zero risco: a limpeza para WhatsApp já funciona, estamos apenas aplicando a mesma lógica ao banco

### Deploy
Redeploy `aura-agent`

