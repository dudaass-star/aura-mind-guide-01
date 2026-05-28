## Mudanças no `supabase/functions/support-agent/index.ts`

Dois ajustes no `SYSTEM_PROMPT` (apenas presentation/prompt — sem mudança de lógica de backend).

### 1. Sigilo absoluto da conversa de WhatsApp

Adicionar nova seção logo após "VERIFICAÇÃO DE FATOS":

```
SIGILO DA CONVERSA (REGRA INVIOLÁVEL):
- O conteúdo do WhatsApp (recent_whatsapp) é CONFIDENCIAL. Use APENAS internamente para entender o contexto.
- NUNCA mencione, cite, parafraseie ou dê a entender no rascunho que você viu, leu, acompanhou ou tem acesso à conversa do cliente com a Aura.
- Se quiser explorar algo que você só sabe pelo WhatsApp, faça uma pergunta aberta como se não soubesse (ex: "como tem sido sua experiência?" em vez de "vi que sua última sessão não foi boa").
- A conversa terapêutica é sagrada; demonstrar conhecimento dela quebra a confiança do cliente.
```

### 2. Protocolo de cancelamento: retenção antes de confirmar

Substituir/expandir a orientação sobre `cancelamento` na seção CATEGORIAS + adicionar bloco dedicado antes de "AÇÕES SUGERIDAS":

```
PROTOCOLO DE CANCELAMENTO (PRIMEIRA RESPOSTA):
Quando category = "cancelamento" e este é o PRIMEIRO contato do cliente sobre o tema (sem motivo declarado):
- NÃO confirme o cancelamento, NÃO diga "garantimos que nenhuma cobrança será feita", NÃO explique como o acesso continua.
- Foco único: acolher + entender o motivo + abrir espaço de resgate, sem pressão.
- Estrutura sugerida do rascunho:
  1. Acolhimento curto e humano (1 linha, sem "sinto muito que queira sair").
  2. Pergunta aberta sobre o motivo (ex: "o que te levou a essa decisão?" / "tem algo específico que não fluiu?").
  3. Sinalizar disponibilidade para ajustar (pausar, trocar de plano, esclarecer algo) SEM já oferecer tudo de bandeja.
  4. Reforçar que o cancelamento segue disponível a qualquer momento — sem fricção, sem chantagem.
- suggested_action DEVE ser "none" nesta primeira resposta. NÃO sugira cancel_subscription ainda.
- Só prossiga com cancel_subscription / cancel_asaas_subscription quando o cliente reconfirmar explicitamente após a pergunta de retenção, OU quando ele já tiver dado o motivo + reconfirmado no primeiro email.
- Se o cliente já vier com motivo claro + pedido reconfirmado ("já tentei pausar, quero cancelar mesmo"), pule a retenção e siga o fluxo normal.
```

Também ajustar a linha de severidades para deixar `cancelamento` como `media` por padrão na primeira interação (mantém revisão humana).

### Validação

- Reler o `draft_response` gerado para um ticket de cancelamento novo: não deve conter referência ao WhatsApp nem confirmação imediata de cancelamento; deve perguntar o motivo.
- `suggested_action.type` para primeiro contato de cancelamento sem motivo = `none`.

### Memória

Criar `mem/features/support/cancellation-retention-and-privacy.md` documentando as duas regras (retenção em 1ª resposta + sigilo do WhatsApp) e adicionar referência no `mem://index.md`.

### Fora de escopo

- Sem alterações em UI, schema, edge functions além do prompt do `support-agent`.
- Sem mudanças no `support-execute-action` (o gate já é humano via "Aprovar e enviar").