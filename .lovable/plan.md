# Recomendações do Meta (AAM + fbc no Purchase): o que faz sentido

## Veredito

Pixel em uso: **939366085297921** — confirmado no `index.html` e nos envios do CAPI.

1. **AAM (Correspondência Avançada Automática): faz sentido, e é ação no Gerenciador de Eventos, não no código.** É um toggle no dataset. Hoje o navegador só manda `_fbp`/`_fbc`; e-mail/telefone só saem pelo servidor (CAPI). Ligar o AAM melhora o match dos eventos de navegador (Lead, InitiateCheckout, PageView) sem tocar no site. Sem risco de duplicar: o dedupe já é por `event_id`.

2. **"Enviar o `_fbc` também na compra": parcialmente válida.** O encanamento **já existe** — `_fbc` é capturado no checkout, gravado na assinatura/mandato e reenviado no `Purchase` por todos os trilhos (Stripe, Asaas, Inter, Woovi). O log `meta_capi_log` mostra:

```text
Purchases recentes    fbc presente
12/08 (Woovi)         1 de 2
11/08 (Inter)         0 de 2   <- também sem _fbp
07/08 (Stripe)        1 de 1
05/08 e 03/08 (Asaas) 2 de 2
```

Ou seja, a cobertura baixa não é falta de código: falha quando o comprador **não tem cookie** no momento do checkout — tráfego orgânico, cookie apagado, bloqueador, ou compra iniciada num dispositivo e concluída em outro (comum no PIX). Além disso, a persistência de `_fbc` por 90 dias só foi ao ar hoje, então os números que o Meta analisou são de antes da correção.

## O que vou implementar (ganho real de cobertura)

**A. Cache de identidade por lead (fallback do `fbc`/`fbp`)**
- Nova tabela `meta_identity_cache` (email/telefone normalizados + `fbp`, `fbc`, `updated_at`), gravada no primeiro contato do funil e sempre que houver `fbclid` novo.
- Em todos os caminhos de `Purchase` (`stripe-webhook`, `webhook-woovi`, `webhook-inter`, `webhook-asaas`), quando o `fbc` do metadado vier vazio, buscar o último `fbc` conhecido daquele e-mail/telefone (janela de 90 dias) antes de enviar. Isso cobre compra em outro dispositivo e cookie perdido no caminho.

**B. `fbclid` também no cartão Asaas**
- Passar `fbc` derivado do `fbclid` da URL como fallback no `AsaasCardForm` (hoje lê só o cookie), igual ao que o fluxo PIX já faz.

**C. Advanced Matching manual no navegador (complemento do AAM)**
- Reinicializar o pixel com `em`/`ph`/`fn` (já digitados no checkout) no momento do `Lead`/`InitiateCheckout`, para o evento de navegador ter chave forte mesmo sem AAM. Nenhum dado novo é coletado — são os mesmos campos do formulário, hasheados pelo próprio pixel.

**D. Observabilidade**
- KPI simples no admin: cobertura de `fbc`/`fbp`/e-mail por evento nos últimos 30 dias, para acompanhar se a cobertura do `Purchase` sobe depois da mudança.

## O que fica do seu lado (Meta, não código)

- Ligar o **AAM** no dataset 939366085297921 (Gerenciador de Eventos > Configurações > Correspondência avançada automática).
- Conferir que o conjunto "Isabella 1" está vinculado a esse dataset.

## Detalhes técnicos

- Migração: `meta_identity_cache` com RLS (sem acesso anon; leitura/escrita só por service_role das edge functions) e índice por email e por telefone.
- Escrita do cache: `create-checkout`, `criar-pix-recorrente-woovi|inter|asaas`, `criar-cartao-asaas` (onde já recebem `fbp`/`fbc`).
- Leitura/fallback: helper novo em `supabase/functions/_shared/meta-identity.ts`, usado nos 4 webhooks antes de montar o payload do CAPI.
- A regra de `Purchase` só na 1ª compra permanece intocada.