## Problema

O `rescue-sessions-blast` usa `antiBurstDelayForInstance` (25–45s entre envios), herança dos tempos do ZAPI. Com Twilio (API oficial) isso não tem sentido — Twilio aceita rajada sem risco. O delay é exatamente o que estoura o tempo do worker e deixa envios pela metade (apenas ~11 dos 40 saíram).

## Plano

### 1. Remover o anti-burst do `rescue-sessions-blast`

- Tirar `antiBurstDelayForInstance` e `groupByInstance` do loop.
- Disparar tudo em paralelo controlado com `Promise.all` em lotes de ~10 simultâneos (só para não estourar conexões; sem `sleep` entre eles).
- Manter: checagem de janela 08h–22h BRT, log em `failed_message_log`, update de `last_reactivation_sent` e insert em `messages`.

Resultado esperado: 40 envios em segundos, não em minutos.

### 2. Deploy + disparo único dos 29 restantes

- Deploy `rescue-sessions-blast`.
- `curl_edge_functions` POST sem `limit` → pega só quem ainda não tem sessão futura e não recebeu (a query já é idempotente: quem respondeu e marcou sessão sai do filtro; o resto recebe).

### 3. Validação

- Conferir `sent`/`errors` na resposta.
- `SELECT count(*) FROM profiles WHERE user_id IN (...) AND last_reactivation_sent >= today` para conferir que cobriu os 40.
- Olhar `failed_message_log` para os erros.

## Fora de escopo

- Mexer em outras funções que ainda usam `antiBurstDelay*` (reactivation-blast, reengagement-blast, etc.). Se quiser, faço varredura depois — mas só essas que ainda rodam via ZAPI precisam. Para as 100% Twilio, dá pra remover também numa próxima passada.

Confirma que sigo?