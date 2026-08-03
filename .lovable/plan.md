# Não é o Eduardo: 46 clientes receberam o aviso de "mudei de número"

## O que os dados mostram

- O aviso "Oi! Mudei de número 💛 Me chama aqui agora: wa.me/15559586099" foi enviado para **46 perfis** desde 11/06/2026 — **8 deles nos últimos 7 dias** (o último foi o Eduardo, 03/08 16:02 UTC).
- Todos os 71 perfis do banco estão com `whatsapp_provider = 'meta'`, e `system_config.whatsapp_provider = 'meta'`. Ou seja: a condição do aviso é verdadeira para 100% da base.
- Como o envio proativo pelo Meta falha e cai no fallback Twilio, quem fala com o cliente é o número **antigo** (+1 662 525 5005) — e é exatamente nesse chat que o webhook responde "mudei de número", apontando para um número que hoje não atende inbound.
- Por que ninguém mais reclamou: o aviso é enviado **uma vez a cada 7 dias por perfil** e o fluxo normal só é bloqueado naquela mensagem. Na mensagem seguinte a Aura volta a responder no mesmo chat (foi o que aconteceu com o Eduardo: aviso 16:02, resposta normal 16:04). O cliente entende como bug pontual e segue no mesmo número — o Eduardo só foi o primeiro a relatar.
- A trava já está no lugar: o aviso agora depende de `system_config.twilio_redirect_notice_enabled = 'true'`, chave que **não existe** hoje. Nenhum cliente novo recebe mais o redirecionamento.

## O que ainda falta fazer

### 1. Confirmar que a trava está em produção
Verificar nos logs do `webhook-twilio` a linha `Redirect notice desabilitado` em inbounds recentes. Se a função não estiver redeployada com a versão do gate, redeployar.

### 2. Verificar se o número novo atende inbound
Checar no Twilio/Meta se `+1 555 958 6099` tem webhook de entrada ligado. Se não atende, ele não deve aparecer em nenhum texto — e os clientes que foram mandados pra lá precisam de retorno.

### 3. Retorno para os afetados recentes
Para os perfis com `twilio_redirect_notice_sent_at` nos últimos 30 dias que **não voltaram a conversar depois do aviso**, enviar uma mensagem curta pelo número que já atende (+1 662 525 5005) desfazendo o engano: "ignora o aviso de troca de número, é aqui mesmo que eu te respondo". Hoje esse conjunto é pequeno (a maioria voltou a falar normalmente), então dá pra fazer com uma varredura pontual.

### 4. Remover o número novo de textos e limpar o marcador
- Tirar o `wa.me/15559586099` do código enquanto o Meta não estiver entregando de fato.
- Zerar `twilio_redirect_notice_sent_at` dos afetados, para que, quando a migração for real, o aviso possa ser enviado de novo sem o bloqueio de 7 dias.

### 5. Só reativar a flag depois do Meta funcionar
Ordem correta da migração: (a) Meta entregando proativo sem cair no fallback, (b) inbound do número novo respondido pelo agente, (c) aviso de troca ligado via flag. Fora dessa ordem, o aviso volta a mandar cliente para o vazio.

## Detalhes técnicos

- Origem do aviso: `supabase/functions/webhook-twilio/index.ts` (bloco "REDIRECIONAMENTO MIGRAÇÃO TWILIO → META"), já protegido pelo gate `twilio_redirect_notice_enabled`.
- Fallback que faz o número antigo continuar falando: `_shared/whatsapp-official.ts` / `_shared/whatsapp-provider.ts` (qualquer erro Meta cai pra Twilio).
- Varredura de retorno: consulta em `profiles` cruzando `twilio_redirect_notice_sent_at` com o último registro em `messages`.
