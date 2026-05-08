## Aviso importante sobre o que você está vendo

O arquivo `.lovable/plan.md` aberto no editor é o **plano antigo do Safety Net D0** (já implementado e em produção desde 08/05 cedo). Ele **não é** o plano para resolver o silêncio da Luana — é só um arquivo histórico que ficou aberto. Vou descrever abaixo o plano que de fato resolve o problema atual.

## Verificação do diagnóstico (feita agora, com dados reais)

1. **Código no repo está correto.** `aura-agent/index.ts:4791` declara `const meditationCatalog` **fora** do `if (profile?.user_id)`, com comentário explicativo (linhas 4789-4790: "Mantido fora do if(profile?.user_id) para evitar ReferenceError quando o fallback de meditação roda"). O fallback em `index.ts:7430` consegue enxergar a variável.

2. **Produção está com a versão antiga.** A `failed_message_log` mostra **9 falhas** com `meditationCatalog is not defined` nas últimas 24h, a última às **17:11 UTC de hoje** (já depois do nosso fix). Todas vêm da `process-webhook-message` invocando a `aura-agent`.

3. **Apenas a Luana é afetada.** As mensagens acumuladas dela contêm "meditação", o que dispara o regex em `index.ts:7422-7423` (`['meditacao','meditar',...]`) → entra no fallback → ReferenceError na versão deployada. Outros usuários não escreveram essa palavra recentemente, então nem entram nesse caminho.

4. **Conclusão:** Drift entre repo e produção. O fix está commitado mas o GitHub Actions não publicou — provavelmente porque commits do Lovable nem sempre disparam o workflow definido em `.github/workflows/deploy-functions.yml`.

## Esta é a solução correta? Sim — com 3 partes

A "solução real" não é só republicar. Se republicar e nada mais, o mesmo bug pode voltar amanhã via outro caminho. O plano abaixo resolve **agora** + **previne reincidência**.

### Parte 1 — Republicar o `aura-agent` (resolve o agora)

Usar `supabase--deploy_edge_functions(["aura-agent"])`. Sem mudança de código — só promover o que já está no repo.

**Validação imediata pós-deploy:**
- `select created_at, error from failed_message_log where created_at > now() - interval '5 min' and error like '%meditationCatalog%'` → tem que voltar 0 linhas.
- Verificar mensagens novas da Luana: `select role, content, created_at from messages where user_id='802bbcf8-690c-4956-b350-87973337ad11' order by created_at desc limit 5` → tem que aparecer `assistant` recente.

### Parte 2 — Mensagem de recuperação para a Luana

Ela ficou ~17h sem resposta após mandar 6 mensagens pedindo conexão. Janela de 24h ainda aberta (última msg dela 17:09 UTC). Disparar 1 `sendProactive` (categoria `checkin` = texto livre dentro da janela) com algo curto e honesto:

> "Luana, me perdoa o sumiço — tive um problema técnico aqui e suas mensagens não chegaram em mim. Tô de volta. Quer continuar de onde parou (segurança, cargo público, o Ravi) ou começar pelo que tá mais vivo agora?"

Pode ir pelo painel admin (`/admin/messages`) que já usa `admin-send-message` → `sendProactive` corretamente.

### Parte 3 — Hardening preventivo (mesmo deploy)

a) **Try/catch defensivo no fallback de meditação** (`aura-agent/index.ts:7420-7470`):
   Envolver todo o bloco `if (!meditationMatch && ...)` em `try { ... } catch (e) { console.warn('[meditation-fallback] skipped:', e); }`. Esse fallback é **opcional** — se quebrar, no pior caso o usuário não recebe a meditação, mas a resposta principal da Aura segue. Hoje um erro ali derruba a resposta inteira.

b) **Garantir que commits do Lovable disparem o deploy:**
   - O workflow atual usa `paths:` com filtro restritivo (`supabase/functions/aura-agent/**` etc.). Push do Lovable em outros caminhos não dispara, e às vezes o trigger nem dispara mesmo com path match (depende de permissões do `GITHUB_TOKEN`).
   - Adicionar `workflow_dispatch:` ao topo do workflow → permite trigger manual via UI/API quando preciso.
   - Opcional: remover o filtro `paths:` para garantir deploy em qualquer push para `main` (custo: ~30s a mais por commit, ganho: zero drift).

c) **Alerta operacional simples:** cron diário (já temos infra) que faz `select count(*) from failed_message_log where created_at > now() - interval '1 hour' and resolved = false group by error having count(*) >= 3` e dispara email pra `ADMIN_ALERT_EMAIL`. Hoje a Luana ficou 17h sem ninguém perceber.

### Parte 4 — Memória

Atualizar `mem://technical/ai/aura-agent-deployment-and-fallback-safety.md` (criar se não existir) com:
- Commits do Lovable em `supabase/functions/**` **podem não disparar** o workflow → sempre validar com `failed_message_log` depois de mexer no agent.
- Padrão obrigatório: qualquer fallback opcional dentro do `aura-agent` deve estar em `try/catch` próprio.

## Arquivos que serão tocados

- `supabase/functions/aura-agent/index.ts` — try/catch no bloco 7420-7470 (Parte 3a).
- `.github/workflows/deploy-functions.yml` — adicionar `workflow_dispatch` e revisar `paths` (Parte 3b).
- `mem/technical/ai/aura-agent-deployment-and-fallback-safety.md` (novo) + `mem/index.md` (referência).
- **Sem migration**, sem mudança de schema, sem nova edge function.

## Risco / rollback

- Republicar `aura-agent`: risco mínimo. É exatamente o código atual do repo, fix de 1 linha já validado.
- Try/catch: risco zero — só impede propagação de erro.
- Mudança no workflow: zero impacto runtime — só configuração de CI.

## Por que esta É a solução real (e não só uma correção pontual)

- **Resolve o sintoma:** Luana volta a receber resposta no próximo deploy.
- **Resolve a causa direta:** o fix do escopo da variável já está no código.
- **Resolve a causa sistêmica:** drift de deploy + fallback frágil + zero alerta. Sem isso, o próximo bug parecido vai silenciar outro usuário por horas de novo.
