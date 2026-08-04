# Entender o erro do disparo da campanha

O teste individual chegou certo (mesmo ContentSid, botões de quick reply funcionando), então o template está aprovado e o caminho de envio existe. Quando o teste passa e o disparo para a base falha, a causa quase nunca é o template — é algo que só aparece em volume ou em números diferentes do seu. Como o código/erro exato do provedor ainda não foi informado, o primeiro passo é ler o erro real em vez de adivinhar.

## Passo 1 — Levantar o erro real (diagnóstico)

Consolidar, para a janela do disparo:

- `failed_message_log` — o que as funções de envio registraram (erro, `function_name`, telefone, horário).
- Logs das edge functions de envio no período do disparo.
- Retorno de status da Twilio (status callback) por mensagem: `queued` / `sent` / `delivered` / `failed` / `undelivered` + código de erro.

Saída deste passo: uma tabela "código do erro → quantos números → o que significa", para saber se foi 1 problema ou vários.

## Passo 2 — Classificar a causa

As famílias possíveis, e o que cada uma implica:

```text
63016 / fora da janela 24h ......... enviou texto livre onde só template vale
132000 ............................. nº de variáveis do template != nº enviado
131049 / 131047 .................... limite de qualidade/marketing do Meta
131026 ............................. número inválido / sem WhatsApp
429 / rate limit ................... volume acima do throughput permitido
limite diário de marketing ......... base maior que a cota do número
opt-out / suprimido ................ contato que não deveria receber
```

## Passo 3 — Corrigir por categoria, não por número

A correção depende do que o passo 1 mostrar; o padrão é:

- Erro de variáveis → alinhar a contagem de variáveis com o template aprovado antes de qualquer novo disparo.
- Rate limit / cota → enviar em lotes com throttle e retomada, em vez de tudo de uma vez.
- Números inválidos / opt-out → filtrar a base antes do envio (normalização 55+DDD+9 e lista de supressão).
- Janela/categoria → garantir que o disparo em massa use sempre template, nunca texto livre.

## Passo 4 — Deixar o disparo auditável

Registrar por contato: enviado, entregue, falhou (com código) e qual botão foi clicado — para o próximo disparo o erro aparecer na hora, não depois.

## Detalhes técnicos

- Consultas de leitura em `failed_message_log` e nos logs de edge function; nenhuma alteração de dados no passo 1.
- Envio em massa deve respeitar a janela 08h–21h BRT para categoria marketing (regra já usada no dunning).
- Se o disparo foi feito por uma ferramenta externa (a conversa do print é de outro número/marca), o passo 1 vira leitura do relatório de entrega da própria ferramenta — nesse caso me diga qual, porque não há log dela aqui.
