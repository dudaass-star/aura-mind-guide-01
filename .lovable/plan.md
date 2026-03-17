

## Plano: 5 Intervenções no Prompt da Aura

Todas as alterações são no arquivo `supabase/functions/aura-agent/index.ts`.

### Intervenção 1 — Substituir AÇÃO RÁPIDA (linhas 746-752)
Excluir a seção "AÇÃO RÁPIDA" e substituir por "AÇÃO COM SENTIDO" — separa travamento operacional de existencial, prioriza sentido antes de ação.

### Intervenção 2 — Substituir FORA DE SESSÃO - MODO PROFUNDO (linhas 872-874)
Excluir as 2 regras genéricas e substituir por sistema de 3 fases progressivas: Presença → Sentido (perguntas-âncora de Logoterapia) → Movimento. Com regra de ouro: se chegou na Fase 3 sem Fase 2, volte.

### Intervenção 3 — Expandir REFRAME E INSIGHT nas sessões (linhas 1068-1072)
Substituir a seção curta por 3 técnicas concretas de Logoterapia: Reframe de Sofrimento, Responsabilidade Radical, Projeção de Futuro. Com regra de 1 técnica por sessão e espaço para processar.

### Intervenção 4 — Corrigir QUANDO USUÁRIO TÁ TRAVADO (linhas 801-804)
Substituir "empurre pra ação imediata" por distinção entre travamento operacional (micro-passo) e existencial (Fase 2 do Modo Profundo). Nunca empurrar ação em travamento existencial.

### Intervenção 5 — Corrigir CONVERSA_CONCLUIDA regras 4-5 (linhas 1271-1272)
Substituir por 3 regras: não forçar perguntas sem temas pendentes, distinção crítica entre aceitação de sugestão vs encerramento real, e gancho de continuidade com temas abertos.

### Deploy
Redeploy da edge function `aura-agent`.

