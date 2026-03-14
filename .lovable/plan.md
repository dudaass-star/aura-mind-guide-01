

## Situação Atual — Trials de Hoje

Encontrei **5 trials** criados hoje. Apenas a **Rita** (última cadastrada) já tem o `trial_activation_audio` agendado pela nova lógica.

| Nome | Telefone | Msgs | Cadastro (BRT) | Situação |
|------|----------|------|-----------------|----------|
| Rita de | 5511968509858 | 0 | 15:31 | ✅ Áudio agendado (novo código) |
| Claudiana Alcantara | 5583986410675 | 0 | 12:07 | ❌ Silenciosa 6h+ — precisa nudge |
| Silvia Omita | 5519996938515 | 5 | 08:22 | ❌ Completou trial, sem closing |
| Eliane duarte | 5521976992177 | 0 | 08:02 | ❌ Silenciosa 10h+ — precisa nudge |
| Eliane Duarte | 55**55**219769921 | 0 | 08:00 | ⚠️ Telefone parece inválido (duplicata?) |

### Ações Propostas

**1. Claudiana e Eliane duarte** (silenciosas, 0 mensagens)
- Agendar `trial_activation_audio` para execução imediata (áudio TTS)
- Como já passaram 6h+, o áudio de ativação é a melhor abordagem

**2. Silvia Omita** (completou 5 conversas, não assinou)
- Agendar `trial_closing` para execução imediata (mensagem de encerramento com link de checkout)

**3. Eliane Duarte (telefone 5555...)** 
- Parece um cadastro duplicado com telefone errado (começa com 5555 em vez de 55). Provavelmente não vai funcionar o envio.

### Como será feito
- Inserir `scheduled_tasks` manualmente via SQL para os 3 usuários válidos
- O `execute-scheduled-tasks` (cron a cada 5 min) vai pegar e executar automaticamente

