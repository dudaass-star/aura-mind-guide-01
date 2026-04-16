

## Resposta direta às suas perguntas

**1. Vou criar templates novos no admin?** Não. Os templates já existem na sua tabela `whatsapp_templates`. Vou apenas **atualizar 3 linhas existentes** com os novos SIDs aprovados e ativar.

**2. Vou usar os modelos antigos?** Os antigos (`PENDING_APPROVAL`) viram lixo nessa categoria. Vou substituir pelos novos SIDs aprovados nas categorias certas.

**3. Onde a lógica nova entra?** Em **lugar nenhum**. A infra já existe (`sendProactive` → `whatsapp-official.ts` → busca template por `category` na tabela). É só apontar SID novo + desligar duplicações de check-in.

---

## Mapeamento dos 3 templates para as categorias existentes

| Template Twilio aprovado | SID | → Categoria existente | Função do template |
|---|---|---|---|
| `cheking_7dias` (texto puro) | `HX4e299f6168e7d4ac4159c14ed470fca6` | `checkin` | Único cutucão para usuário 7 dias parado |
| `jornada_disponivel` (Quick Reply) | `HX54e6d3098d40e95d14252af533db8725` | `content` | Teaser jornada → botão abre 24h → conteúdo livre |
| `relatorio_semanal` (Quick Reply) | `HX607738eeadd6fc8008c5735bbf0457a1` | `weekly_report` | Já está cadastrado com esse SID. Só revisar. |

`weekly_report` **já tem esse SID e está ativo** — nenhuma ação. As mudanças reais são só `checkin` e `content`.

---

## O que o sistema já faz hoje (nada de lógica nova)

```text
qualquer função → sendProactive(phone, texto, 'checkin', userId)
                       ↓
            whatsapp-provider.ts (decide provider)
                       ↓
            whatsapp-official.ts → sendProactiveMessage()
                       ↓
            SELECT * FROM whatsapp_templates WHERE category = 'checkin'
                       ↓
            usa twilio_content_sid + envia via Twilio Gateway
```

Ou seja: **basta o SID estar correto na linha certa da tabela**. Tudo que chama `sendProactive(..., 'checkin', ...)` já vai usar `cheking_7dias` automaticamente.

---

## Sobre a regra "só 1 check-in (7 dias)"

Hoje há 2 caminhos que podem mandar check-in proativo:

1. **`scheduled-checkin/index.ts`** — query: usuários ativos, 7+ dias sem mensagem, sem check-in nos últimos 30 dias. Usa `sendProactive(..., 'checkin', ...)`. ✅ **Esse é o correto, mantemos.**
2. **`reactivation-check/index.ts`** — manda mensagens de reativação (categoria `reactivation`). Pode sobrepor com check-in se rodar em janelas próximas.
3. **`reengagement-blast/index.ts`** — blast de reengajamento.

Para evitar flood, vou **ler os 3 e propor desativação ou unificação** dos que duplicam o gatilho de "usuário parado".

---

## Plano de execução

### Etapa 1 — Atualizar tabela `whatsapp_templates` (migration)
- `category='checkin'`: `twilio_content_sid='HX4e299f6168e7d4ac4159c14ed470fca6'`, `template_name='cheking_7dias'`, `is_active=true`, `prefix=''` (template já tem corpo próprio, sem prefixo)
- `category='content'`: `twilio_content_sid='HX54e6d3098d40e95d14252af533db8725'`, `template_name='jornada_disponivel'`, `is_active=true`, `prefix=''`
- `category='weekly_report'`: já correto. Sem ação.

### Etapa 2 — Garantir gatilho único de check-in
- Confirmar que `scheduled-checkin` é o único cron que dispara categoria `checkin`
- Auditar `reactivation-check` e `reengagement-blast`: se houver sobreposição de público (ex: "7+ dias parado") → reduzir frequência ou desativar para evitar flood
- Documentar em memória: **`cheking_7dias` é o único check-in proativo permitido**

### Etapa 3 — Validar fluxo Quick Reply de `jornada_disponivel`
- Conferir que quando o template manda Quick Reply, o `webhook-twilio` reconhece a resposta do botão e dispara o conteúdo livre da jornada na sequência (memória `template-link-strategy-twilio` já cobre esse padrão)

### Etapa 4 — Atualizar memória
- Registrar os 3 SIDs novos como fonte oficial
- Reforçar regra: nenhum outro template de check-in pode ser criado/ativado

---

## Arquivos afetados

- **Migration SQL** — atualiza 2 linhas em `whatsapp_templates`
- **`supabase/functions/scheduled-checkin/index.ts`** — só leitura, confirmar regra de 7 dias intacta
- **`supabase/functions/reactivation-check/index.ts`** + **`reengagement-blast/index.ts`** — possível ajuste de frequência (a confirmar após leitura)
- **Memória** — novo arquivo registrando os 3 SIDs como fonte da verdade

Nenhum código novo de envio. Nenhum novo template no admin. Nenhuma lógica paralela.

