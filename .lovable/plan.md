

# Backup Completo do Input da IA (aura-agent)

## O que sera salvo

O arquivo de backup vai conter TODO o input que vai para a IA, nao apenas o template. Isso inclui:

### Parte 1: Template Base (~960 linhas)
A variavel `AURA_SYSTEM_PROMPT` completa (linhas 194-1158) com todos os 15 placeholders.

### Parte 2: Logica de Construcao do finalPrompt (~400 linhas)
Todo o codigo que monta o prompt final (linhas 3025-3466), incluindo:
- Substituicao de placeholders (contextualPrompt)
- Contexto de continuidade entre sessoes
- Dados de onboarding
- Tracking de temas e compromissos
- Contexto de trial gratuito
- Gap temporal
- Agenda do usuario
- Controle de fases da sessao
- Contexto de interrupcao
- Instrucoes de upgrade
- Configuracao de agenda mensal
- Instrucoes de encerramento

### Parte 3: Contextos Condicionais (~300 linhas)
Blocos que sao injetados condicionalmente:
- Primeira sessao / onboarding estruturado (linhas 2775-2887, com as 5 fases)
- Sessao pendente / sessao perdida (linhas 2986-3023)
- Audio de sessao (linhas 3036-3048)
- Jornada de conteudo

### Parte 4: Mensagens enviadas a API
A estrutura final: `[system: finalPrompt] + [messageHistory] + [user: message]`

## Arquivo de saida

`docs/AURA_FULL_INPUT_BACKUP_2026-02-22.md`

Organizado em secoes claras com todo o codigo relevante em blocos, para que possa ser restaurado se necessario.

## Detalhes tecnicos

- O arquivo tera aproximadamente 1800-2000 linhas (template + codigo de construcao + contextos condicionais)
- Inclui mapeamento de todas as variaveis, queries ao banco e condicoes que afetam o prompt
- Nao altera nenhum codigo funcional

