# Quiet hours seletivo no recovery WhatsApp

## Contexto

Hoje `recover-abandoned-checkout-whatsapp` aplica um bloqueio global de quiet hours (22h-08h BRT) logo no início da função (linhas 102-108). Isso afeta tanto o estágio 1 (15 min após abandono) quanto o estágio 2 (24h após).

O estágio 1 é continuação direta de uma interação ativa do usuário — ele acabou de quase contratar e provavelmente ainda está online. Bloquear faz com que o lembrete saia muito depois do momento de maior intenção, ou até no dia seguinte. Mesma lógica que já adotamos em `post-session-quiet-hours-bypass` (rating/resumo de sessão ignoram silêncio porque respondem a interação ativa).

O estágio 2, por outro lado, é cold outreach 24h depois — faz sentido respeitar o silêncio noturno.

## Mudança

**Arquivo:** `supabase/functions/recover-abandoned-checkout-whatsapp/index.ts`

1. Remover o bloqueio global de quiet hours no início do handler (linhas 102-108).
2. Adicionar um campo `respectsQuietHours: boolean` em `StageConfig`:
   - Estágio 1 (15min): `false` → envia a qualquer hora.
   - Estágio 2 (24h): `true` → bloqueia 22h-08h BRT.
3. Dentro de `processStage` e `processStageAsaas`, no topo, checar:
   ```ts
   if (cfg.respectsQuietHours && isQuietHourBRT()) {
     console.log(`🌙 [WA stage ${cfg.label}] quiet hours, pulando este estágio.`);
     return { sent: 0, failed: 0, skipped: 0 };
   }
   ```
4. Manter `isQuietHourBRT()` como está (já implementada).
5. Atualizar o comentário no topo do arquivo: "Respeita silêncio 22h-08h BRT **apenas no estágio 24h**".

Sem mudanças no fluxo de e-mail (`recover-abandoned-checkout`), sem mudanças de schema, sem alterar dedup/lifetime cap/skip de clientes ativos.

## Memória

Atualizar `mem/features/recovery/whatsapp-subaccount-recovery.md` para registrar que o estágio 15min ignora quiet hours por ser continuação de interação ativa (mesmo princípio do `post-session-quiet-hours-bypass`).

## Validação

- Checkout abandonado às 23:50 BRT → estágio 1 dispara no próximo ciclo (a cada 5 min), idealmente entre 00:05-00:10.
- Estágio 2 desse mesmo checkout só dispara após as 08h do dia seguinte (24h + janela permitida).
- Logs `[WA stage 15min]` aparecem em horário noturno; `[WA stage 24h]` continuam bloqueados com `quiet hours, pulando este estágio.`
