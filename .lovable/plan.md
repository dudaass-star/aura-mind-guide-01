## Problema
Toda meditação proativa entra com o prefixo **"Sua jornada chegou 📖"** porque `send-meditation/index.ts` usa `sendProactive(..., 'content', ...)` — e `PROACTIVE_TITLES.content` é "Sua jornada chegou 📖" (usado também por Jornadas reais).

Meditação ≠ Jornada. Precisa de título próprio.

## Solução
Adicionar uma categoria dedicada `meditation` ao contrato de títulos proativos e usá-la no `send-meditation`.

### Arquivos alterados

**1. `supabase/functions/_shared/whatsapp-official.ts`**
- Adicionar `meditation` ao tipo `TemplateCategory` (se for union local) ou ao `PROACTIVE_TITLES`:
  ```ts
  meditation: 'Sua meditação chegou 🧘',
  ```
- Adicionar a mesma entrada em `CLICK_DELIVERY_TITLES` para consistência (caso vire fast-path no futuro).

**2. `supabase/functions/_shared/meta-whatsapp-client.ts`** (se tiver enum espelhado)
- Garantir que `meditation` está aceito como categoria válida (sem mapeamento de template Twilio — meditação só viaja em janela 24h aberta como texto livre + áudio).

**3. `supabase/functions/send-meditation/index.ts`**
- Trocar as 3 chamadas `sendProactive(userPhone, ..., 'content', userId)` por `'meditation'`:
  - intro message (linha ~163)
  - fallback "meditação não pronta" (linha ~135)
  - fallback "áudio falhou, link aqui" (linha ~180)

### Out of scope
- Não mexer no prompt da Aura, no catálogo, nem em `generate-meditation-audio`.
- Não criar template Twilio novo — meditação continua dependendo de janela 24h aberta (já é assim hoje).
- Manter categoria `content` intacta para Jornadas reais (deliver-time-capsule, periodic-content etc.).

### Validação
1. Deploy `send-meditation`.
2. Pedir meditação no WhatsApp → confirmar que a 1ª bolha começa com **"Sua meditação chegou 🧘"** em vez de "Sua jornada chegou 📖".
3. Confirmar que Jornadas reais (cápsula do tempo, conteúdo periódico) continuam com "Sua jornada chegou 📖".

### Memória a atualizar
`mem://features/whatsapp/proactive-message-titles` — adicionar a categoria `meditation` ao mapa documentado.