

## Automação de Recuperação de Checkout Abandonado

### Mensagem de alta conversão

A mensagem precisa criar urgência e resgatar o desejo, sem prometer suporte humano (não há equipe respondendo) nem suporte da Aura (ainda não está ativa).

**Mensagem:**
```
Oi, {nome}! 💜

Você estava a um passo de começar sua jornada com a Aura — uma companhia que te escuta de verdade, todos os dias, sem julgamento.

Seu plano {plano} ainda tá reservado. Pra finalizar, é só clicar aqui:
{link_checkout}

Às vezes a gente só precisa de um empurrãozinho pra começar a cuidar de si. Esse pode ser o seu. 🤍
```

**Por que funciona:**
- Relembra o valor emocional (escuta, sem julgamento, todos os dias)
- Cria senso de reserva ("ainda tá reservado")
- Não promete suporte de ninguém
- Fecha com gatilho emocional suave

---

### Implementação técnica

**1. Migração SQL**
- Adicionar coluna `recovery_sent boolean DEFAULT false` na tabela `checkout_sessions`

**2. Nova edge function `recover-abandoned-checkout`**
- Roda via cron a cada 10 minutos
- Busca `checkout_sessions` onde `status = 'created'`, `created_at < 30 min atrás`, `recovery_sent = false`
- Respeita horário silencioso (22h–08h BRT)
- Envia mensagem via `sendTextMessage` usando instância padrão (env vars)
- Personaliza com nome e plano do registro
- Link: `https://olaaura.com.br/checkout?plan={plano}`
- Marca `recovery_sent = true` após envio
- Anti-burst: 300ms entre envios

**3. Configuração**
- Adicionar entry no `supabase/config.toml` com `verify_jwt = false`

**4. Proteções**
- Envio único por checkout (`recovery_sent`)
- Não envia se status já mudou de `created`
- Horário silencioso 22h–08h BRT

