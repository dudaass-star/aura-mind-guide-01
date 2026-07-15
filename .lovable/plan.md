## Problema
Ao clicar em "Atualizar forma de pagamento", o botão fica alguns segundos sem feedback visível (a edge chama Stripe/Asaas e só depois redireciona). No mobile isso passa sensação de "não funcionou" e o usuário pode clicar de novo.

Hoje já existe um `Loader2` no ícone e `disabled` no botão, mas: (a) o spinner é pequeno demais pra ser notado, (b) não há mensagem de "abrindo…", (c) nada bloqueia a percepção enquanto o navegador espera o redirect.

## Solução (lean, só UX)

**1. Toast imediato de "Abrindo…"**
Assim que o clique acontece (antes do `invoke`), disparar um `toast({ title: "Abrindo página de pagamento…", description: "Só um instante." })`. Feedback aparece em <100ms, mata a dúvida.

**2. Texto do botão muda enquanto carrega**
Trocar `"Atualizar forma de pagamento"` por `"Abrindo…"` quando `portalLoading === true`, mantendo o spinner. Sinal claro de que algo está acontecendo.

**3. Aplicar o mesmo padrão no "Trocar de plano"**
O botão de trocar plano abre um dialog que também carrega dados — mesma sensação de "travou". Adicionar toast/loading equivalente lá.

**4. (Opcional, se topar) Pré-buscar o link em background**
Ao entrar no portal, se o usuário não é PIX Asaas, invocar `customer-portal` uma vez em background e guardar `data.url` em estado. Clique vira redirect instantâneo (`window.location.href = cachedUrl`). Trade-off: gasta 1 invocação extra por sessão do portal mesmo se o usuário não clicar. Fica só como opção, minha recomendação é **não fazer** agora — os itens 1-3 já resolvem a percepção sem custo extra.

## Arquivos afetados
- `src/pages/UserPortal.tsx` — adicionar toast em `handleOpenBillingPortal`, mudar label do botão condicionalmente, mesmo tratamento no botão de trocar plano.

Nenhuma mudança em edge functions ou lógica de negócio.
