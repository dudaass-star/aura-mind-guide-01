

# Plano Revisado: Ajustar os Testes, Não o Prompt

## Filosofia

Concordo — engessar o prompt com keywords obrigatórias e limites rígidos de caracteres vai contra a essência da Aura. O prompt deve continuar orgânico. O problema real é que **os testes são rígidos demais** na forma como avaliam qualidade.

A abordagem correta: tornar os testes mais inteligentes e flexíveis, e corrigir o único bug real (weekly-report ignorando dry_run).

---

## Mudanças Propostas

### 1. Conversa Casual — relaxar limite de chars (run-system-tests)
- Atual: falha se resposta > 500 chars (linha 69)
- **Novo**: subir para 800 chars, e tornar warning em vez de fail. Respostas naturais no WhatsApp variam — forçar brevidade artificial é pior que uma resposta um pouco mais longa

### 2. Conversa Emocional — usar IA para avaliar validação (run-system-tests)
- Atual: busca keywords específicas como "válid", "normal", "faz sentido" (linhas 194-205)
- **Novo**: manter a checagem de invalidação (palavras proibidas como "exagero") mas substituir a checagem de validação por uma avaliação via IA. Perguntar ao modelo: "A resposta da Aura valida o sentimento do usuário?" — isso captura validação empática mesmo sem keywords exatas

### 3. Sessão Parte 2 — usar IA para avaliar reframe (run-system-tests)
- Atual: busca keywords como "perspectiva", "olhar", "possibilidade" (linhas 474-480)
- **Novo**: substituir a checagem de keywords por avaliação via IA: "A resposta oferece uma nova forma de ver a situação?" — captura reframes naturais que não usam palavras clichê
- Manter as checagens de key_insights e commitments como estão (essas são dados estruturados no banco, não questão de prompt)

### 4. Relatório Semanal — corrigir bug do dry_run (weekly-report)
- **Bug real**: quando `dry_run === true`, o código ainda pula usuários com mensagens nos últimos 10 minutos (linha 269). Como os testes acabaram de enviar mensagens com o mesmo user_id, o relatório é sempre pulado
- **Fix**: adicionar `&& !dryRun` na condição do skip por mensagem recente (e do skip por sessão ativa)

---

## Resumo

| Arquivo | Mudança | Risco |
|---------|---------|-------|
| `run-system-tests/index.ts` | Casual: limite 800 chars + warning | Baixo |
| `run-system-tests/index.ts` | Emocional: validação via IA em vez de keywords | Baixo |
| `run-system-tests/index.ts` | Reframe: avaliação via IA em vez de keywords | Baixo |
| `weekly-report/index.ts` | Bypass de "mensagem recente" quando dry_run | Baixo |

**Zero mudanças no prompt da Aura.** Apenas testes mais inteligentes e um bug fix.

