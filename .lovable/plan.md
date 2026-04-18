

## Diagnóstico definitivo: por que só 3 receberam jornada na sexta

### Os números reais (confirmados por SQL agora)

```
Total active/trial com telefone:        41
├─ Com current_journey_id preenchido:    3   ← receberam EP na sexta (Letícia, Daniela, Nilda)
└─ Com current_journey_id = NULL:       38   ← BLOQUEADOS no filtro principal

Elegíveis no próximo ciclo:              0
Em cooldown de 2.5 dias:                 3
Em do_not_disturb:                       0
```

**Correção da análise anterior:** os "5 da sexta" que mencionei antes incluíam Eduardo Santos e Clara, mas eles têm `current_journey_id = NULL`. O `last_content_sent_at` deles foi atualizado por OUTRA coisa (insight do Oráculo, lembrete de sessão ou check-in) — não por episódio de jornada. Apenas **3 pessoas** receberam EP de jornada na sexta.

### A lógica que filtra (periodic-content/index.ts, linhas 84-101)

```text
SELECT * FROM profiles
WHERE status IN ('active','trial')           ← passam 41
  AND current_journey_id IS NOT NULL         ← ❌ corta 38, sobram 3
  AND phone IS NOT NULL                       ← passam 3
  AND (last_content_sent_at IS NULL
       OR last_content_sent_at <= NOW() - 2.5 dias)  ← passam 3
```

**O filtro eliminatório é `current_journey_id IS NOT NULL`**. 38 de 41 assinantes ativos têm esse campo NULL e por isso são invisíveis ao cron de jornadas.

### Por que tantos estão NULL? O fallback dos 48h existe, mas nunca dispara

Linhas 60-83 do mesmo arquivo tentam atribuir jornada automaticamente para quem está há 48h sem conteúdo:

```text
fallbackThreshold = NOW() - 48h
SELECT ... WHERE current_journey_id IS NULL
            AND last_content_sent_at <= fallbackThreshold
```

**Bug:** o filtro usa `last_content_sent_at <= 48h atrás`, mas para usuários novos esse campo é **NULL** desde o cadastro. `NULL <= timestamp` retorna `NULL` (não `true`), então o Postgres **descarta a linha**. Resultado: o fallback nunca alcança quem mais precisa — os recém-cadastrados que nunca receberam nada. Ele só pegaria alguém que já teve jornada antes e ficou 48h parado.

Combinado com o fato de que `start-trial` e `stripe-webhook` **não atribuem jornada inicial**, o efeito é: novos usuários entram com `current_journey_id = NULL`, o fallback ignora eles, o cron principal ignora eles, e ficam para sempre fora do envio proativo.

### Plano de correção (3 partes)

**1. Atribuir jornada inicial no onboarding** (raiz do problema)
- Em `start-trial/index.ts` e no handler de `checkout.session.completed` do `stripe-webhook/index.ts`: ao criar/ativar o perfil, definir `current_journey_id = 'j1-ansiedade'` e `current_episode = 0`. Isso garante que todo novo assinante entra no pipeline de envio.

**2. Corrigir o fallback dos 48h em `periodic-content/index.ts`**
- Trocar o filtro `.lte('last_content_sent_at', fallbackThreshold)` por `.or('last_content_sent_at.is.null,last_content_sent_at.lte.<threshold>')` para que perfis com campo NULL também sejam alcançados.
- Usar `created_at` como referência alternativa: só ativar fallback se o perfil tem mais de 24-48h de vida (evita atribuir jornada antes do welcome).

**3. Backfill retroativo dos 38 afetados**
- Migration única atribuindo `current_journey_id = 'j1-ansiedade'` e `current_episode = 0` para todos os perfis com `status IN ('active','trial')`, `phone IS NOT NULL`, `current_journey_id IS NULL` e `created_at < NOW() - 24h`.
- Deixar `last_content_sent_at = NULL` para que recebam o EP1 no próximo tick do cron (sem esperar 2.5 dias).

### Detalhes técnicos

- Cron `periodic-content` roda a cada execução do scheduler; quiet hours 22h-08h BRT.
- Após a correção, os 38 receberão EP1 da `j1-ansiedade` em ondas, respeitando o anti-burst delay por instância (que hoje é só Twilio Oficial).
- Risco: enviar EP1 de uma vez para 38 pessoas. Mitigação: o cron já processa em série dentro de cada grupo de instância, então sairão espaçados naturalmente.
- A escolha de `j1-ansiedade` como jornada padrão é coerente com os 3 que já estão no pipeline (todos em `j1-ansiedade`). Alternativa: deixar essa jornada inicial configurável em `system_config`.

### O que NÃO vou tocar

- A lógica de cooldown de 2.5 dias entre episódios — está correta.
- A lógica de fim de jornada (linhas 175-194) — está correta.
- A geração do manifesto / teaser — não é onde o bug está.

