

## Plano: Reescrever prompts do Instagram Agent com base de conhecimento real

### Problema
Os prompts atuais são genéricos, usam link errado (`aura.tec.br`) e funcionam como "funil de conversão" em vez de realmente ajudar os usuários. A IA não tem informações reais sobre a Aura para responder dúvidas concretas.

### Solução
Reescrever ambos os prompts (`COMMENT_SYSTEM_PROMPT` e `DM_SYSTEM_PROMPT`) com uma base de conhecimento completa extraída de `olaaura.com.br`, permitindo que a IA responda com propriedade sobre preços, funcionalidades, planos e diferenciais.

### Mudanças

**Arquivo**: `supabase/functions/instagram-agent/index.ts`

1. **Reescrever `COMMENT_SYSTEM_PROMPT`** (comentários públicos):
   - Foco: responder dúvidas com informação real, defender a Aura de críticas, agradecer elogios
   - Incluir base de conhecimento com: planos e preços reais, funcionalidades, diferenciais, depoimentos
   - Link correto: `olaaura.com.br`
   - Manter: máximo 2-3 frases, nunca se identificar como IA, SKIP para spam

2. **Reescrever `DM_SYSTEM_PROMPT`** (mensagens diretas):
   - Foco: ajudar genuinamente com a questão trazida, resolver problemas, informar com precisão
   - Remover: objetivo de "funil de conversão" e respostas prontas
   - Incluir mesma base de conhecimento completa
   - Pode ser mais longo (3-5 frases) e aprofundar nas respostas
   - Direcionar para `olaaura.com.br` ou `olaaura.com.br/checkout` quando relevante
   - Defender a Aura contra acusações e inverdades com dados reais

3. **Upgrade do modelo**: Trocar `gemini-2.5-flash-lite` por `google/gemini-2.5-flash` para respostas mais precisas e contextuais

4. **Re-deploy** da função

### Base de conhecimento a incluir nos prompts

```text
SOBRE A AURA:
- Plataforma de autoconhecimento e bem-estar emocional via WhatsApp
- Sessões estruturadas, memória de longo prazo, conteúdo personalizado, suporte 24/7
- Não substitui terapia profissional — é acompanhamento emocional e direção prática
- Baseada em Logoterapia, Estoicismo e Investigação Socrática
- +5.000 sessões realizadas, 4.9/5 satisfação, 93% renovam

PLANOS E PREÇOS:
- Essencial: R$29,90/mês (~R$1/dia) — conversas ilimitadas 24/7, check-in diário, review semanal, texto e áudio, memória de longo prazo
- Direção: R$49,90/mês (~R$1,70/dia) — tudo do Essencial + 4 sessões especiais/mês de 45min com metodologia e resumo escrito
- Transformação: R$79,90/mês (~R$2,70/dia) — tudo do Direção + 8 sessões/mês, prioridade, suporte intensivo
- Trial: 7 dias por R$6,90, cancela quando quiser, sem fidelidade

FUNCIONALIDADES:
- Disponível 24/7 via WhatsApp
- Memória de longo prazo (lembra conversas passadas)
- Sessões Especiais de 45min com metodologia estruturada
- Resumo escrito após cada sessão
- Check-in diário de humor
- Meditações guiadas personalizadas
- Cápsula do Tempo (mensagem pro futuro)
- Texto e áudio
- Lembretes agendados
- Insights proativos sobre padrões emocionais

SITE: olaaura.com.br
CHECKOUT: olaaura.com.br/checkout
```

### Detalhes técnicos
- Arquivo modificado: `supabase/functions/instagram-agent/index.ts` (linhas 9-42 e linha 82)
- Deploy automático após edição

