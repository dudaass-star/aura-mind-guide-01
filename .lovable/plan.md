

# Plano: Remover Abertura Contextual das Jornadas

## Objetivo

Simplificar o envio de episódios das jornadas, removendo a parte inicial onde a IA tenta criar um contexto personalizado antes do conteúdo principal.

## O que será removido

A função `generate-episode-manifesto` atualmente faz o seguinte:
1. Busca as últimas 15 mensagens do usuário
2. Chama a IA para gerar 2-3 linhas contextuais conectando conversas recentes ao tema
3. Inclui esse texto contextual antes do conteúdo do episódio

**Antes (formato atual):**
```
Oi Carlos. 💜

📍 *EP 1/8 — SENTIR*
_Jornada da Ansiedade_

---

[Texto gerado por IA conectando conversas recentes]

---

[Conteúdo do episódio]

---

⏭️ *No próximo episódio...*
[Hook]

Te espero. 💜
```

**Depois (formato simplificado):**
```
Oi Carlos. 💜

📍 *EP 1/8 — SENTIR*
_Jornada da Ansiedade_

---

[Conteúdo do episódio]

---

⏭️ *No próximo episódio...*
[Hook]

Te espero. 💜
```

## Mudanças Técnicas

### Arquivo: `supabase/functions/generate-episode-manifesto/index.ts`

1. **Remover busca de mensagens recentes** (linhas 57-71)
   - Não precisamos mais buscar o histórico de mensagens

2. **Remover geração de abertura contextual via IA** (linhas 73-129)
   - Toda a lógica de chamada à API de IA será removida
   - A variável `contextualOpening` será eliminada

3. **Simplificar template de mensagem** (linhas 139-190)
   - Remover a seção `${contextualOpening}` e o separador `---` associado
   - O conteúdo do episódio (`essayContent`) virá logo após o cabeçalho

## Benefícios

- Mensagens mais diretas e objetivas
- Menor latência (sem chamada extra à IA)
- Menor consumo de tokens/créditos
- Experiência mais consistente

