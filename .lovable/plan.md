## Problema

No painel `/admin/support` o rascunho da IA fica numa coluna fixa de `400px` à direita. Em telas como a sua (~920px CSS de preview, mas também em laptops 1366px reais), o texto sai com 4-5 palavras por linha, dentro de um `ScrollArea` curto — fica difícil de ler e revisar.

Hoje o grid é:
```
[ lista 320px | email 1fr | rascunho 400px ]
```

## Proposta

Trocar para um layout de **2 colunas** com **abas no painel central**, dando à área de leitura/edição toda a largura disponível:

```
[ lista 300px | painel principal 1fr ]
                 ├─ Tabs: [Email do cliente] [Rascunho da IA ●]
                 └─ Conteúdo da aba ocupa 100% da largura
```

- A lista de tickets à esquerda fica igual (um pouco mais estreita: 300px).
- O painel central vira um container com duas abas controladas:
  - **Email do cliente** — assunto, remetente, thread original, link "Ver contexto do cliente".
  - **Rascunho da IA** — header (modelo, KB match), corpo do rascunho num `Textarea` grande (ou área de leitura larga), bloco "Ação sugerida", input de hint, e a barra de ações fixa no rodapé (`Aprovar e enviar`, `Snooze 24h`, `Fechar`).
- A aba "Rascunho" recebe um ponto/badge quando há rascunho pronto e abre automaticamente ao selecionar um ticket que já tenha rascunho.
- O corpo do rascunho passa a usar `max-w-3xl` centralizado dentro da aba, com altura `flex-1` (sem `ScrollArea` apertado), garantindo leitura confortável (~80 caracteres por linha).
- A barra de ações (Aprovar / Snooze / Fechar / Hint) fica fixa no rodapé do painel, sempre visível.

Em telas muito largas (≥1536px) podemos opcionalmente mostrar email + rascunho lado a lado novamente (split 1:1), mas o default passa a ser tabs — resolve o problema atual sem regressão em monitores grandes.

## Mudanças técnicas

Arquivo único: `src/pages/AdminSupport.tsx`

1. Trocar o grid da linha 402:
   ```
   lg:grid-cols-[300px_1fr]   // era [320px_1fr_400px]
   ```
2. Envolver os dois cards atuais (email do cliente + rascunho) num componente com `Tabs` do shadcn (`Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` — já usados no projeto).
3. Estado `activeTab` ('email' | 'draft'); ao carregar ticket com `draft_response`, setar `'draft'`.
4. Badge/dot no `TabsTrigger` "Rascunho" quando `draft_response` existe e status = `pending_review`.
5. Mover a barra de ações (Aprovar/Snooze/Fechar/Hint) para um rodapé `sticky bottom-0` dentro da aba Rascunho, com `max-w-3xl mx-auto`.
6. Trocar o `ScrollArea` curto do rascunho por um container `flex-1 overflow-auto` para ocupar toda a altura disponível.
7. Manter todo o comportamento existente (handlers, polling, ações, regenerar, etc.) — apenas reorganização visual.

## Fora de escopo

- Lógica de IA, edge functions, schema.
- Mudar comportamento de aprovação, snooze, regenerar.
- Responsivo mobile (continua stack vertical como hoje).
