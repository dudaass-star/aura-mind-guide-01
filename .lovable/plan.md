Objetivo: Reduzir o atrito psicológico no checkout V2 com 4 melhorias puramente frontend, sem mexer no Stripe Dashboard nem em edge functions. Foco: dar segurança e clareza ao usuário no momento do clique.

Escopo
------
Apenas `src/pages/CheckoutV2.tsx`. Nenhum outro arquivo é tocado.

---

### 5. Progress indicator (Passo 1 de 2 / Passo 2 de 2)

Adicionar um stepper minimalista no topo do conteúdo, logo abaixo do header, que muda conforme o estado do checkout:

- **FormView** (embeddedClientSecret = null): `● Seus dados — ○ Pagamento`
- **PaymentView** (embeddedClientSecret presente): `✓ Seus dados — ● Pagamento`

Visual: dois pequenos círculos + labels, com cor sage para ativo/completo e branco/40 para pendente. Sem caixa, sem fundo — só um respirinho. Reduz a ansiedade de "será que tem mais etapa depois?".

---

### 6. Auto-foco + teclado mobile correto

No FormView, ajustar os 3 inputs para acelerar preenchimento mobile:

- **WhatsApp**: adicionar `autoFocus`, `inputMode="numeric"`, `autoComplete="tel-national"`
- **Nome**: adicionar `autoComplete="name"`, `autoCapitalize="words"`
- **Email**: adicionar `autoComplete="email"`, `inputMode="email"`, `autoCapitalize="none"`, `spellCheck={false}`

Resultado: teclado numérico abre direto no WhatsApp, navegador oferece autopreenchimento, sem capitalização errada no email. Em mobile é o tipo de detalhe que economiza 5-10 segundos e evita erros de digitação que levam ao abandono.

---

### 7. Trust signals colados ao widget Stripe

Hoje a faixa de confiança (Garantia/Stripe/Cancele) está abaixo do widget, distante demais do momento da decisão. Mover para **logo acima do widget**, dentro do PaymentView, em formato compacto:

```
[🔒 Pagamento seguro Stripe]  [🛡️ Garantia 7 dias]  [✓ Cancele em 1 clique]
```

Visual: linha única, ícones pequenos sage, texto branco/70, fundo sutil `bg-white/5` com border-radius. Fica entre o resumo do plano e o widget branco da Stripe. O olho do usuário bate nesses selos *no segundo antes* de começar a digitar o cartão — é onde a confiança importa.

A faixa que existe hoje abaixo do widget pode ficar (reforço) ou ser removida pra não duplicar. Proposta: **remover a de baixo** e deixar só a de cima, mais próxima do ponto de decisão.

---

### 8. Microcópia do CTA final

Hoje: `Começar por R$ 6,90`

Proposta: `Começar trial por R$ 6,90 — cancele quando quiser`

E o helper abaixo do botão:
- Hoje: `Sem compromisso • Cancele em 1 clique no WhatsApp`
- Novo: `7 dias completos • Sem cobrança se cancelar antes do 8º dia`

A mudança é cirúrgica: troca "sem compromisso" (vago) por uma promessa específica e datada que neutraliza o medo #1 do trial pago ("vou esquecer e ser cobrado").

---

Validação
---------
1. Visualizar `/v2/checkout` em mobile 390x844:
   - Stepper visível, "Seus dados" ativo
   - Foco automático no campo WhatsApp, teclado numérico abre
   - CTA com nova cópia
2. Preencher form e clicar "Começar trial":
   - Stepper atualiza para "Pagamento" ativo
   - Trust signals aparecem em linha única acima do widget branco
   - Widget Stripe carrega normalmente
3. Conferir desktop 1280x720: layout do stepper e trust signals não quebra.

Não-objetivos
-------------
- Não mexer em `create-checkout/index.ts` (item 3 da lista anterior fica para outra rodada)
- Não habilitar Apple Pay/PIX (itens 1, 2 dependem do Stripe Dashboard)
- Não criar fluxo de WhatsApp recovery (item 4 é backend)