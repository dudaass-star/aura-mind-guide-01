

## Ajuste da regra de SKIP — saudações curtas

### Contexto

Hoje, no `instagram-agent`, o prompt instrui:
> "COMENTÁRIOS MUITO CURTOS (1-2 palavras genéricas como 'legal', 'top'): Retorne SKIP"

Resultado: comentários como "Olá", "Aura", "Oi", "👋" são ignorados — perdemos oportunidade de iniciar conversa e mostrar presença ativa da marca.

---

### Mudança

No arquivo `supabase/functions/instagram-agent/index.ts`, atualizar o `COMMENT_SYSTEM_PROMPT`:

**Substituir** a regra atual de SKIP curtos por uma regra com **dois caminhos**:

1. **Saudações / menção à marca** (1-3 palavras: "olá", "oi", "aura", "👋", "❤️", nome da marca, emoji solto positivo) → responder com saudação curta e calorosa (1 frase + 1 emoji). Exemplos:
   - "Olá" → "Oi! 👋 Tudo bem?"
   - "Aura" → "Oi! 💜 Que bom te ver por aqui."
   - "❤️" → "Obrigada! 💜"
   - "Top" → "Que bom! 🙌"

2. **Spam / irrelevante de fato** (caracteres aleatórios, links suspeitos, comentários sem qualquer sentido) → continua retornando `SKIP`.

### Texto novo da regra (substituirá as duas linhas atuais sobre SKIP em comentários)

```
- SAUDAÇÕES CURTAS / MENÇÃO À MARCA (ex: "olá", "oi", "aura", "❤️", "👋", "top", "amei", emoji solto positivo): Responda com saudação curta e calorosa (1 frase + 1 emoji). Ex: "Oi! 👋 Tudo bem?" / "Obrigada! 💜" / "Que bom te ver por aqui 🌿". Não force pergunta se não fizer sentido.
- SPAM REAL (links suspeitos, caracteres aleatórios, conteúdo sem sentido, autopromoção de terceiros): Retorne SKIP
```

A regra de "DÚVIDAS/PERGUNTAS", "PROBLEMAS", "CRÍTICAS sobre IA" e "ELOGIOS longos" permanece intacta.

---

### Onde NÃO mexer

- `DM_SYSTEM_PROMPT` (DMs já não tinham regra de SKIP curto, e merecem resposta mais elaborada de qualquer jeito)
- Lógica de envio (Graph API), classificação de sentimento, logging de interações
- Frontend `/admin/instagram`
- Banco de dados

---

### Resultado esperado

- Comentários como "Olá", "Aura", "❤️", "Top" passam a receber resposta curta e amigável (presença ativa da marca)
- Spam real (links, lixo) continua sendo ignorado
- Volume de respostas vai subir um pouco — bem dentro do limite diário (2/100 hoje)

---

### Plano de execução

1. Editar 2 linhas do `COMMENT_SYSTEM_PROMPT` em `supabase/functions/instagram-agent/index.ts`
2. Redeploy automático da edge function
3. Verificar no `/admin/instagram` nos próximos comentários curtos que a resposta sai corretamente

