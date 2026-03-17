

## Plano: Reforçar Protocolo — Automedicação e Triagem Clínica

### Mudanças em `supabase/functions/aura-agent/index.ts`

**1. Expandir PROIBIDO no Nível 1 (após linha 466):**

Adicionar bloco explícito proibindo:
- Perguntas de triagem clínica ("você tem plano?", "como faria isso?")
- Sugerir médico/posto de saúde/UBS por automedicação
- Usar saúde física como pretexto para encaminhamento

Incluir instrução positiva: se o usuário mencionar automedicação, acolher e continuar ("Entendo. E como você tá se sentindo com ele?").

**2. Expandir "O que NÃO ativa" no Nível 2 (após linha 491):**

Adicionar exemplos:
- "Tomo remédio pra dormir por conta própria" → NÃO sugira médico
- Menção a automedicação sem intenção de overdose → Nível 1

**3. Refinar gatilhos do Nível 2 (linhas 475-484):**

Deixar claro que medicação só ativa Nível 2 quando há intenção de overdose imediata:
- "Já tomei os comprimidos todos" ✅
- "Vou tomar tudo de uma vez" ✅
- "Tomo remédio por conta" ❌ (Nível 1)

### Deploy
Redeploy `aura-agent`.

