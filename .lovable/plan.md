

## Remover FAQ "Como funciona a garantia de 7 dias?"

### Mudanca
Remover o item do array `faqs` no arquivo `src/components/FAQ.tsx` que contem a pergunta "Como funciona a garantia de 7 dias?" e sua respectiva resposta.

### Detalhes tecnicos
- **Arquivo:** `src/components/FAQ.tsx`
- **Linhas a remover:** 30-33 (o objeto com `question: "Como funciona a garantia de 7 dias?"`)
- O array passara de 9 para 8 perguntas
- Nenhuma outra mudanca necessaria, pois o componente renderiza dinamicamente com `faqs.map()`

