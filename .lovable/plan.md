

## Controle determinístico de fases da sessão no finalPrompt

### Problema
Hoje, as instruções de fase da sessão ficam apenas no `timeContext` (system prompt), que é um texto longo com tabelas, exemplos e regras. Quando o modelo "esquece" a fase, o hard block pós-resposta corrige removendo tags, mas o **tom e conteúdo** da resposta já saíram errados (ex: fazer resumo durante exploração).

### Solução
Aplicar o mesmo padrão dos blocos temporal e agenda: injetar um bloco **curto, imperativo e calculado pelo servidor** no `finalPrompt`, logo após os blocos de agenda e temporal. Esse bloco fica na última posição antes da geração, onde o modelo presta mais atenção.

### Detalhes técnicos

**Arquivo:** `supabase/functions/aura-agent/index.ts`

**Mudança única** - Após o bloco de agenda (~linha 3238), adicionar:

```typescript
// ========================================================================
// CONTROLE DE SESSÃO - Reforço determinístico de fase no finalPrompt
// ========================================================================
if (sessionActive && currentSession?.started_at) {
  const phaseInfo = calculateSessionTimeContext(currentSession);
  const elapsed = Math.floor(
    (Date.now() - new Date(currentSession.started_at).getTime()) / 60000
  );

  let phaseBlock = `\n\n⏱️ CONTROLE DE SESSÃO (CALCULADO PELO SISTEMA - SIGA OBRIGATORIAMENTE):`;
  phaseBlock += `\nTempo decorrido: ${elapsed} min | Restante: ${Math.max(0, phaseInfo.timeRemaining)} min`;
  phaseBlock += `\nFase atual: ${phaseInfo.phase.toUpperCase()}`;

  if (['opening', 'exploration', 'reframe', 'development'].includes(phaseInfo.phase)) {
    phaseBlock += `\n🚫 PROIBIDO: NÃO resuma, NÃO feche, NÃO diga "nossa sessão está terminando".`;
    phaseBlock += `\n✅ OBRIGATÓRIO: Continue explorando e aprofundando.`;
    if (phaseInfo.phase === 'opening' && elapsed <= 3) {
      phaseBlock += `\n📌 PRIMEIROS MINUTOS. Faça abertura e check-in.`;
    } else if (phaseInfo.phase === 'exploration') {
      phaseBlock += `\n📌 EXPLORAÇÃO. Vá mais fundo. Uma observação + uma pergunta.`;
    }
  } else if (phaseInfo.phase === 'transition') {
    phaseBlock += `\n⏳ Consolide SUAVEMENTE. Não abra tópicos novos.`;
  } else if (phaseInfo.phase === 'soft_closing') {
    phaseBlock += `\n🎯 Resuma insights e defina compromissos. Prepare encerramento.`;
  } else if (phaseInfo.phase === 'final_closing') {
    phaseBlock += `\n💜 ENCERRE AGORA: resumo + compromisso + escala 0-10 + [ENCERRAR_SESSAO].`;
  } else if (phaseInfo.phase === 'overtime') {
    phaseBlock += `\n⏰ TEMPO ESGOTADO. Finalize IMEDIATAMENTE com [ENCERRAR_SESSAO].`;
  }

  finalPrompt += phaseBlock;
  console.log(`⏱️ Session phase reinforcement: ${phaseInfo.phase}, ${elapsed}min elapsed, ${phaseInfo.timeRemaining}min remaining`);
}
```

### Como funciona em 3 camadas

1. **`timeContext` no system prompt** - instruções detalhadas com tabelas e exemplos (já existe)
2. **Bloco no `finalPrompt`** - reforço curto e imperativo no final da conversa (NOVO)
3. **Hard block pós-resposta** - remove tags de encerramento em fases iniciais (já existe)

### Impacto
- Zero custo extra (usa `calculateSessionTimeContext` que já é chamado)
- Bloco curto e imperativo na posição de maior atenção do modelo
- Tripla camada de proteção contra encerramento prematuro
- Mesmo padrão dos blocos temporal e agenda

