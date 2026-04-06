

## Plano: Otimizar popup de exit-intent para conversão

### Problema atual

O popup atual é puramente emocional e genérico. Ele pede para o usuário ficar mas **não oferece nenhum incentivo concreto**. Popups de exit-intent com maior conversão oferecem uma razão tangível para o usuário reconsiderar.

### Melhorias propostas

**1. Reforçar o valor concreto do trial**
- Trocar o emoji por um ícone de presente/oferta
- Destacar o preço do trial (R$ 6,90 / R$ 9,90 / R$ 19,90) e os 7 dias de acesso
- Mencionar a garantia de satisfação

**2. Adicionar urgência leve**
- Texto como "Sua oferta de trial ainda está ativa" para criar senso de oportunidade

**3. Incluir micro social proof**
- Linha curta: "+500 pessoas já começaram sua jornada com a AURA"

**4. CTA mais específico**
- Trocar "Continuar minha jornada" por algo como "Quero experimentar por R$ {trialPrice}"
- O botão reflete o preço real do plano selecionado

**5. Opção secundária de contato**
- Link de WhatsApp para tirar dúvidas antes de sair ("Prefere tirar uma dúvida? Fale conosco")

### Estrutura do popup revisado

```text
┌─────────────────────────────────────┐
│         🎁  Espera!                 │
│                                     │
│  Sua oferta de trial ainda está     │
│  ativa: 7 dias por apenas           │
│  R$ 9,90 (plano Direção)            │
│                                     │
│  ✓ Garantia de satisfação           │
│  ✓ Cancele quando quiser            │
│  ✓ +500 pessoas já começaram        │
│                                     │
│  [Quero experimentar por R$ 9,90]   │
│                                     │
│  Prefere tirar uma dúvida?          │
│  Fale conosco no WhatsApp           │
│                                     │
│         Não, obrigado               │
└─────────────────────────────────────┘
```

### Detalhes técnicos

- **Arquivo**: `src/pages/Checkout.tsx` (bloco do popup, linhas ~509-537)
- O popup já tem acesso a `currentPlan` e `selectedPlan` — basta referenciar `currentPlan.trialPrice` e `currentPlan.name` no texto
- Adicionar link de WhatsApp com URL `https://wa.me/55NUMERO` (número do suporte AURA)
- Manter a lógica de sessionStorage (exibir apenas 1x por sessão)
- Manter animação existente (`animate-in fade-in zoom-in-95`)

### Escopo

1 arquivo modificado: `src/pages/Checkout.tsx` (apenas o bloco JSX do popup)

