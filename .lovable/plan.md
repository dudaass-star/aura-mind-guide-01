

## Plano: Criar página admin de preview do popup de exit-intent

### O que será feito

Criar uma nova página administrativa (`/admin/popup-preview`) que renderiza o popup de exit-intent em estado visível permanente, permitindo visualizar o design e conteúdo sem precisar acionar o gatilho real no checkout.

### Estrutura

A página exibirá o popup centralizado na tela com os 3 planos disponíveis como seletor, para que você possa ver como o popup fica para cada plano (Despertar, Direção, Transformação) com seus respectivos preços de trial.

```text
┌─────────────────────────────────────────┐
│  ← Voltar   Preview do Popup Exit-Intent│
│                                         │
│  [Despertar] [Direção] [Transformação]  │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │     (popup renderizado aqui)    │    │
│  │     com o plano selecionado     │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

### Detalhes técnicos

- **Novo arquivo**: `src/pages/AdminPopupPreview.tsx`
- **Rota**: `/admin/popup-preview` adicionada em `src/App.tsx`
- Reutiliza os dados de planos já definidos em `Checkout.tsx` (extraídos para constante compartilhada ou duplicados)
- Protegida com `useAdminAuth` (mesma lógica das outras páginas admin)
- Link de acesso adicionado na página `/admin/configuracoes`

### Escopo

- 1 arquivo novo: `src/pages/AdminPopupPreview.tsx`
- 2 arquivos editados: `src/App.tsx` (rota), `src/pages/AdminSettings.tsx` (link)

