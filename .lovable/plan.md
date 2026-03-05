

# Configurar Secrets para Alertas por Email

## O que precisa ser feito

Adicionar 2 secrets ao projeto para que a Edge Function `check-instance-health` consiga enviar emails de alerta quando uma instância Z-API cair:

1. **`RESEND_API_KEY`** — Sua API Key do Resend (encontrada em https://resend.com/api-keys)
2. **`ADMIN_ALERT_EMAIL`** — O email que receberá os alertas de queda (ex: seu email pessoal ou do time)

## Como será feito

- Usar a ferramenta de adicionar secrets para solicitar os dois valores
- Após configurados, a Edge Function `check-instance-health` já está pronta para usá-los automaticamente — não precisa de mudanças no código

## Observação importante

O email de envio configurado no código é `alertas@olaaura.com.br`. Para que o Resend aceite enviar desse remetente, você precisa ter o domínio `olaaura.com.br` verificado no Resend (em https://resend.com/domains). Se ainda não verificou, pode usar o domínio padrão do Resend temporariamente — nesse caso ajustaremos o remetente no código.

