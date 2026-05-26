## Adicionar botão para visualizar texto completo da meditação no Admin

### Contexto
O painel admin de meditações (`AdminMeditations.tsx`) exibe uma tabela com todas as meditações, incluindo colunas para título, categoria, script (tamanho em chars), chunks, status, etc. Cada meditação já tem o campo `script` carregado no objeto. O objetivo é permitir que o administrador visualize o texto completo do script diretamente no painel.

### Implementação

1. **Imports**: Adicionar `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogTrigger` e o ícone `FileText` do lucide-react.

2. **Estado local**: Adicionar estado `selectedScript` para controlar qual script está aberto no modal (ou usar um Dialog inline por linha).

3. **Botão na tabela**: Na coluna "Ações" (`TableCell className="text-right"`), adicionar um botão com ícone `FileText` (tamanho `sm`, variante `ghost`, title="Ver script") que abre um Dialog com o texto completo do `med.script`.

4. **Modal de exibição**: O Dialog conterá:
   - Título: o título da meditação + " — Script"
   - Corpo: área de texto somente leitura ou `<pre>`/`<div className="whitespace-pre-wrap">` com o conteúdo de `med.script`, dentro de um container scrollável (`max-h-[60vh] overflow-y-auto`) para não quebrar o layout em scripts longos.

### Onde colocar
- Botão na coluna de ações, antes dos demais botões (Play, Download, Upload, Delete, Gerar).
- Dialog renderizado inline dentro do `TableRow`, com trigger no botão.

### Nenhuma mudança de schema ou backend necessária — o campo `script` já está presente no objeto `MeditationWithAudio`.