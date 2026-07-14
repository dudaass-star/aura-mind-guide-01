Perfil confirmado: Eduardo Santos (`duda.ass@gmail.com`), plano Direção, com **1300 mensagens, 3 sessões, 111 insights, 1 portrait, 14 correções, 0 snapshots temáticos** — usuário ativo real, ideal pra ver o portal "cheio".

## Objetivo

Entrar no `/meu-espaco` como o Eduardo (sessão real), varrer as 6 abas em mobile e desktop, e devolver uma análise concreta: bugs, ruídos visuais, empty states errados, hierarquia, redundância, o que empurra ou afasta o usuário de voltar.

## Abordagem

A tentativa anterior de rota dev-only falha aqui porque as tabs fazem query via `supabasePortal` e RLS bloqueia sem sessão real. A saída limpa é gerar um **magic link** pro Eduardo via Admin API (server-side, sandbox-only) e o Playwright consumir esse link — a sessão fica real, o portal se comporta 100% como pro usuário final, nada de mock.

### Passos

1. **Edge function temporária `dev-portal-magic-link`**
   - `verify_jwt=false`, protegida por um header secret que só o sandbox conhece (uso `INTERNAL_WEBHOOK_SECRET` já existente).
   - Recebe `{ email }`, chama `supabase.auth.admin.generateLink({ type: 'magiclink', email })` e retorna o `action_link`.
   - Apagada no final da auditoria.

2. **Script Playwright em `/tmp/browser/portal-audit/`**
   - Chama a function → recebe o magic link.
   - Navega no link → portal autentica o Eduardo no `supabasePortal` storage.
   - Aguarda o portal carregar (linkStatus = linked).
   - Percorre as 6 abas: Hoje, Sessões, Percurso, Memória, Sobre você, Meditações.
   - Screenshot de cada uma em mobile (390×844) e desktop (1280×900).
   - Captura console errors e requests que falharam.

3. **Análise**
   - Reviso todos os screenshots com `code--view`.
   - Cruzamento com os dados do banco (ex: 111 insights → como a aba Memória lida com volume? 3 sessões → como Sessões renderiza histórico? 0 snapshots → empty state do Percurso está adequado apesar do usuário ser antigo?).
   - Listagem estruturada: **bugs bloqueantes**, **problemas de UX**, **oportunidades de melhoria**, priorizados.

4. **Limpeza**
   - Deletar edge function `dev-portal-magic-link`.

## Entregável

Um relatório objetivo com:
- Screenshots-chave anexados por referência.
- Achados agrupados por severidade.
- Recomendações concretas (o que mexer, onde, e por quê).
- Nada é alterado no código do portal nesta etapa — só diagnóstico.

Aprovando, entro em modo build, crio a function, rodo a auditoria, entrego a análise e removo a function no mesmo turno.