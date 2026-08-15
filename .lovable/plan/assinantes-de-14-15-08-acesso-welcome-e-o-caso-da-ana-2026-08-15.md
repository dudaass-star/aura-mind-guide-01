# Assinantes de 14–15/08: acesso, welcome e o caso da Ana

## O que foi verificado (leituras reais no banco, na Meta e na Twilio)

5 assinaturas entraram em 14 e 15/08, todas via PIX Woovi, todas com entrada paga (`woovi_charges.status = COMPLETED`):

| Cliente | Telefone | Acesso | Welcome e-mail | Welcome WhatsApp |
|---|---|---|---|---|
| Rachel Carrillo | 5511943994800 | ativo até 21/08 | — (14/08) | entregue, conversou |
| Helena Pennafort | 5522992224656 | ativo até 22/08 | enviado | entregue, conversou (67 msgs) |
| Eliana Regina | 5514997912950 | ativo até 22/08 | enviado | **sem nenhuma mensagem; `[WELCOME]` ainda pendente** |
| Adeildes Celestino | 5511987303098 | ativo até 22/08 | enviado | entregue, conversou |
| Ana Rosa | 5533991235388 | ativo até 22/08 | enviado | **sem nenhuma mensagem; `[WELCOME]` ainda pendente** |

Ou seja: **acesso e e-mail estão 100% em todos os 5**. O furo é no WhatsApp de duas clientes.

## Achados sobre a Ana

1. Na Twilio existe **uma única** mensagem para o número dela, às 11:45 de hoje, com o corpo `"Estou de volta! 💜 / there"` — texto quebrado, sem conteúdo. Nenhum welcome saiu às 04:35, quando o pagamento foi confirmado.
2. Essa mensagem das 11:45 é o follow-up de mandato do `woovi-pix-audit` (categoria `reconnect`). O texto real (acesso liberado + link de autorização) **não entrou na variável do template Twilio** — chegou o placeholder padrão "there". Então ela recebeu algo, mas ilegível e sem link.
3. O mandato PIX dela está `REJEITADA` / `PIX_AUTOMATIC_REJECTED` (banco recusou a autorização). A entrada de R$ 6,90 foi paga, o acesso de 7 dias foi liberado, mas **a renovação não vai acontecer** sem nova autorização.
4. `failed_message_log` está vazio nas últimas 60h: o envio de welcome do `webhook-woovi` só faz `console.log` quando falha, então não há registro de por que o welcome da Ana e da Eliana não saiu.
5. O número Meta oficial é o `+1 555-958-6099` (tier 250, qualidade GREEN) e o template `welcome2` está APPROVED com 0 variáveis — coerente com o que o código monta.

## Correções propostas

### 1. Atendimento imediato às duas clientes
- Reenviar o template de welcome (envio determinístico de template oficial) para Ana e Eliana, mantendo o `[WELCOME]` pendente para a entrega completa no primeiro clique/resposta.
- Para a Ana, enviar em seguida a mensagem de autorização do PIX com o link do mandato — em **texto**, não pelo template quebrado.

### 2. Consertar a variável do template `reconnect`
Rastrear e corrigir o mapeamento de variáveis do `aura_reconnect_v2` no caminho Twilio (o corpo cai para "there" quando a variável não é preenchida). Enquanto o mapeamento não estiver validado, o follow-up de mandato passa a usar um template com variável comprovada ou entrega o link em texto após abrir a janela.

### 3. Observabilidade do welcome (a raiz do "não sei por que não saiu")
- Gravar em `failed_message_log` toda falha de welcome nos webhooks de pagamento (Woovi, Asaas, Stripe, Inter), com `function_name`, telefone e erro do provedor.
- Registrar no perfil o instante do welcome entregue, para uma varredura diária conseguir detectar "pagou, tem acesso, nunca recebeu WhatsApp" e reenviar sozinho.

### 4. Rede de segurança para mandato rejeitado
Quando o webhook Woovi receber `PIX_AUTOMATIC_REJECTED` com entrada paga, tratar como caso ativo de reautorização desde o primeiro dia (mensagem clara com link), em vez de esperar a varredura genérica de mandato pendente.

## Detalhes técnicos

- `supabase/functions/webhook-woovi/index.ts` (~linhas 437-469): grava `[WELCOME]`, dispara `sendProactive(..., "welcome")` com um retry de 3s e enfileira o e-mail; a falha só vai para o console.
- `supabase/functions/_shared/whatsapp-provider.ts`: com `system_config.whatsapp_provider = "meta"`, qualquer falha do Meta cai no fallback Twilio — por isso a ausência de registro na Twilio para Eliana indica falha silenciosa antes do fallback ou sucesso reportado pelo Meta sem entrega.
- `supabase/functions/woovi-pix-audit/index.ts` (`notify`, linhas 68-80 e 160-180): monta o texto correto, mas o envelope `reconnect` da Twilio não recebeu a variável.
