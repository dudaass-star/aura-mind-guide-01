# Por que o welcome do Eduardo não saiu pelo Meta

## O que foi confirmado agora (leituras reais)

1. **O número oficial Meta não é o final 5005.** O `META_WHATSAPP_PHONE_NUMBER_ID` (1102172772986795) tem `display_phone_number = +1 555-958-6099`, `status: CONNECTED`, `quality_rating: GREEN`, `name_status: APPROVED`. O **+1 662 525 5005 é o número da Twilio**. Ou seja: quando o cliente recebe do 5005, o envio foi pelo fallback Twilio, não pelo Meta.

2. **Token, WABA e webhook estão saudáveis.** Token de system user válido, sem expiração, com `whatsapp_business_messaging`; app inscrito na WABA com o campo `messages`; callback correto. `blockers: []`.

3. **A causa real é o template `welcome2`.** Na WABA, o corpo aprovado é:
   `Olá, {{}}. Sua assinatura da Aura foi ativada com sucesso.`
   O placeholder é **literalmente `{{}}`** — não é `{{1}}` nem um parâmetro nomeado. Para a Cloud API esse template tem **zero variáveis válidas**.
   No banco, `whatsapp_templates.category = 'welcome'` está com `meta_variable_count = 1`, então o código monta um componente `body` com 1 parâmetro de texto e o Meta rejeita por incompatibilidade de parâmetros (família 132000). Qualquer erro no Meta cai no fallback Twilio em `_shared/whatsapp-provider.ts` → cliente atendido pelo 5005 → depois o `webhook-twilio` interpretou como "número antigo" e mandou o aviso de mudança de número.

4. **Prova por contraste:** todos os outros templates que também têm `{{}}` na WABA (`cheking_7dias2`, `sessao_inicio2`, `jornada_semanal2`, `relatorio_semanal2`) já estão com `meta_variable_count = 0` no banco. O `welcome` é o único que ficou em `1` — exatamente o que falha.

## Correção principal

- Zerar `meta_variable_count` da categoria `welcome` (o texto aprovado não tem variável). Isso é ajuste de dado, sem mudança de código, e reativa o envio do welcome pelo número Meta.
- Como alternativa de médio prazo (opcional, se quiser o nome do cliente na mensagem): recriar o template com `{{1}}` de verdade e então voltar `meta_variable_count = 1`.

## Achados secundários (mesmo padrão, ainda quebrados)

Estes ficam apontando para templates que **não existem** na WABA e portanto sempre caem no fallback Twilio:

- `session_reminder` → `meta_template_name = 'sessao_inicio'`, mas o aprovado é `sessao_inicio2`.
- `weekly_question` → `meta_template_name = 'pergunta_semanal'` (não existe na WABA; também está marcado como `en`).
- `monthly_letter` → `carta_mensal` existe, mas em idioma `en`.

Recomendo alinhar `session_reminder` para `sessao_inicio2` na mesma passada e tratar `weekly_question` (desativar ou criar o template) depois.

## Detalhes técnicos

- `_shared/meta-whatsapp-client.ts:257` usa `meta_variable_count` como fonte de verdade para montar `components.body.parameters`; `meta-whatsapp-client.ts:161` transforma o 400 do Meta em `success: false`.
- `_shared/whatsapp-provider.ts` (sendProactive) faz fallback para Twilio em qualquer falha do Meta — por isso o sintoma aparece como "veio do número errado" e não como "falhou".
- Para fechar o diagnóstico com evidência de resposta do Meta, um disparo de teste via `qa-meta-send` para um número interno mostraria o código de erro exato antes e depois do ajuste.
