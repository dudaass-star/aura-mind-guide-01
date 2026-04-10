

## Plano: Compactar tabelas de Recovery e Dunning na aba "Semanais & Conversão"

### Problema
As tabelas de "Recuperação de Checkout Abandonado" e "Tentativas de Dunning" ocupam muito espaço vertical, dificultando a visualização das métricas de conversão.

### Solução
Colocar ambas as tabelas dentro de componentes **Collapsible** (já disponível no projeto via `@radix-ui/react-collapsible`), colapsados por padrão. O usuário clica para expandir quando quiser ver os detalhes. Além disso, limitar cada tabela a **5 linhas** visíveis com um botão "Ver mais".

### Alterações em `src/pages/AdminEngagement.tsx`

1. **Importar** `Collapsible, CollapsibleTrigger, CollapsibleContent` de `@/components/ui/collapsible` e `ChevronDown` de `lucide-react`

2. **Tabela Recovery (linhas 612-668)**: Envolver em `Collapsible` com `open={false}` por padrão. O header do Card vira o trigger clicável com ícone de seta. Mostrar apenas resumo (X tentativas, Y converteram) quando colapsado. Limitar a 5 linhas + botão "Ver todos".

3. **Tabela Dunning (linhas 670-738)**: Mesmo tratamento — collapsible, colapsado por padrão, limite de 5 linhas.

4. **Reordenar a aba**: Mover os cards de métricas (`trialCards`) e o funil de conversão para **antes** das tabelas de recovery/dunning, priorizando a visão geral.

### Layout final da aba "Semanais & Conversão"
```text
1. Cards de métricas (grid 4 colunas)
2. Cobranças no Período (3 cards)
3. Funil de Checkout (card)
4. Funil de Conversão (card)
5. Distribuição por Plano
6. ▶ Recuperação de Checkout (colapsado, clique para expandir)
7. ▶ Tentativas de Dunning (colapsado, clique para expandir)
8. Botão Reativar
```

