

# Catalogo Dinamico de Meditacoes no aura-agent

## Problema

As categorias de meditacao estao hardcoded no prompt (linhas 428-434). Cada nova meditacao adicionada ao banco exige editar manualmente o prompt do agente.

## Solucao

Carregar as categorias disponiveis do banco de dados em runtime e injetar no prompt dinamicamente.

## Mudancas em `supabase/functions/aura-agent/index.ts`

### 1. Buscar categorias do banco antes de montar o prompt

No inicio do processamento (antes de montar o system prompt), consultar a tabela `meditations`:

```typescript
const { data: availableMeditations } = await supabase
  .from('meditations')
  .select('category, title, best_for, triggers')
  .eq('is_active', true);

// Agrupar por categoria
const meditationCatalog = new Map<string, { titles: string[], triggers: string[], best_for: string[] }>();
for (const m of availableMeditations || []) {
  if (!meditationCatalog.has(m.category)) {
    meditationCatalog.set(m.category, { titles: [], triggers: [], best_for: [] });
  }
  const entry = meditationCatalog.get(m.category)!;
  entry.titles.push(m.title);
  if (m.triggers) entry.triggers.push(...m.triggers);
  if (m.best_for) entry.best_for.push(m.best_for);
}
```

### 2. Gerar a secao de meditacoes dinamicamente

Substituir as linhas 424-451 (bloco hardcoded) por uma string gerada em runtime:

```typescript
let meditationSection = `# MEDITAÇÕES GUIADAS (BIBLIOTECA PRÉ-GRAVADA)\n\n`;
meditationSection += `Você tem uma BIBLIOTECA de meditações guiadas com áudio profissional.\n\n`;
meditationSection += `**Categorias disponíveis:**\n`;

for (const [category, info] of meditationCatalog) {
  const triggersText = info.triggers.length > 0 ? ` (${info.triggers.join(', ')})` : '';
  meditationSection += `- \`[MEDITACAO:${category}]\` - ${info.titles[0]}${triggersText}\n`;
}

meditationSection += `\n**Como usar:**\n`;
meditationSection += `- Inclua a tag NO FINAL da sua mensagem\n`;
meditationSection += `- NÃO mencione título exato nem duração\n`;
meditationSection += `- NÃO use [MODO_AUDIO] junto com [MEDITACAO:...]\n`;
// ... resto das instrucoes estaticas
```

### 3. Injetar no system prompt

Substituir o bloco estatico de meditacoes pela variavel `meditationSection` na montagem do prompt.

### 4. Fallback mantido

O fallback de keyword detection (plano anterior aprovado) continua valido como segunda camada de seguranca -- e agora usa as categorias reais do banco em vez de um mapa hardcoded.

## Resultado

- Novas categorias adicionadas na tabela `meditations` aparecem automaticamente no prompt da AURA
- Campo `triggers` na tabela `meditations` ja existe e sera usado para informar a AURA quando usar cada categoria
- Campo `best_for` complementa o contexto
- Zero manutencao no codigo ao expandir o catalogo

