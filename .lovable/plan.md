

## Plano: Condensar layout do dashboard de métricas

### Problema atual

Os cards de métricas ocupam muito espaço vertical — cada card tem padding generoso (`p-6`), textos grandes (`text-2xl`), e o grid usa no máximo 3 colunas. Isso força scrolling excessivo para ver todos os dados.

### Melhorias propostas

**1. Cards mais compactos**
- Reduzir padding do CardHeader e CardContent (de `p-6` para `p-3`/`p-4`)
- Diminuir tamanho do valor principal de `text-2xl` para `text-xl`
- Reduzir `gap-4` dos grids para `gap-3`

**2. Grid 4 colunas em desktop**
- Trocar `lg:grid-cols-3` para `lg:grid-cols-4` nos grids de métricas (engajamento, trial, custos, cancelamentos)
- Permite ver mais dados sem scroll

**3. Seção de custo inline**
- Os 3 cards de custo de IA + breakdown podem ficar em layout mais denso
- Breakdown por modelo: converter de Card com header para uma tabela simples inline

**4. Tabs header compacto**
- Reduzir `space-y-6` entre seções para `space-y-4`
- Reduzir espaçamento geral da página de `p-6` para `p-4`

**5. Tabelas mais densas**
- Reduzir font-size das tabelas (recovery, dunning) para `text-xs` consistente
- Compactar padding das cells

### Arquivo modificado

- `src/pages/AdminEngagement.tsx` — ajustes de classes CSS em grids, cards e espaçamento

### Resumo visual esperado

```text
ANTES:                          DEPOIS:
┌────┐ ┌────┐ ┌────┐           ┌───┐ ┌───┐ ┌───┐ ┌───┐
│    │ │    │ │    │           │   │ │   │ │   │ │   │
│    │ │    │ │    │           └───┘ └───┘ └───┘ └───┘
└────┘ └────┘ └────┘           ┌───┐ ┌───┐ ┌───┐ ┌───┐
┌────┐ ┌────┐ ┌────┐           │   │ │   │ │   │ │   │
│    │ │    │ │    │           └───┘ └───┘ └───┘ └───┘
└────┘ └────┘ └────┘
```

~30% menos scroll vertical, mesma informação.

