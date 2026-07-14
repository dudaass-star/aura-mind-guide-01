## Objetivo

Habilitar uma rota de preview dev-only pra eu abrir o portal renderizado e analisar visualmente (mobile + desktop, todas as abas) sem depender de OAuth Google. Depois da análise, remover a rota. Nenhuma alteração de UX chega à produção.

## Guard-rails (não-negociáveis)

- A rota **só existe/renderiza** quando `import.meta.env.DEV === true` **e** `import.meta.env.VITE_ENABLE_PORTAL_PREVIEW === "1"`. Em build de produção, o componente vira `null` e a rota redireciona pra `/`.
- **Nenhum bypass de RLS**. Queries usam o cliente anon normal; se as policies exigirem `auth.uid()`, os dados simplesmente não aparecerão — o que também vira dado útil pra revisão.
- Nada é gravado no banco. Sem service_role. Sem impacto em auth real.
- Meta `robots: noindex, nofollow` (já herdado do UserPortal via Helmet).

## Escopo técnico

**1. Nova rota `/meu-espaco/preview`**
- Novo arquivo `src/pages/UserPortalPreview.tsx`: cópia enxuta do `UserPortal.tsx` sem `PortalAuthProvider`. Aceita `?userId=<uuid>&tab=<id>`. Se flags de dev não ativas → `<Navigate to="/" />`.
- Reusa todos os componentes reais (`HojeTab`, `SessoesTab`, `InsightsTab`, `JornadaTab`, `MemoriaTab`, `SobreVoceTab`, `JornadasTab`, `MeditacoesTab`, `AcoesRapidasBar`, `PerguntaDoDiaCard`, tabs bar com badges).
- Busca `profile` via `supabasePortal` sem depender de sessão (usa o `userId` do query param direto na query). Se RLS bloquear, o card mostra empty state — está tudo bem.

**2. Registro no router**
- `src/App.tsx`: adicionar `<Route path="/meu-espaco/preview" element={<UserPortalPreview />} />` **fora** do `PortalAuthProvider`, guardado por `import.meta.env.DEV`.

**3. Flag de ativação**
- Adicionar `VITE_ENABLE_PORTAL_PREVIEW=1` ao `.env` local (comitado só temporariamente enquanto durar a análise; remover no cleanup).

**4. Captura + análise**
- Playwright roda no sandbox contra `http://localhost:8080/meu-espaco/preview?userId=<uuid>&tab=<x>` em viewports mobile (390×844) e desktop (1280×1800).
- User IDs escolhidos: os que apareceram na consulta anterior (Claudinéia = 4 sessões; um usuário sem dados; um com `pending_insight` se existir) — mapeados via `supabase--read_query` antes de rodar.
- Screenshots salvas em `/tmp/browser/portal/shots/` e revisadas com `code--view`.

**5. Cleanup (obrigatório, mesma sessão de build)**
- Deletar `src/pages/UserPortalPreview.tsx`.
- Remover a rota do `App.tsx`.
- Remover `VITE_ENABLE_PORTAL_PREVIEW` do `.env`.
- Confirmar via `rg` que nada sobrou.

## Entregável

Um relatório com:
- Screenshots de cada aba em mobile e desktop.
- Lista de problemas visuais reais observados (overflow, sobreposição do sticky, badges falsos visíveis, empty states quebrados, contraste, tipografia).
- Recomendação final: pronto pra publicar ou lista priorizada de ajustes (que vira o próximo plano de build).

## Fora de escopo

- Corrigir qualquer problema visual que eu encontre — isso vai pra um plano seguinte, com sua aprovação.
- Refazer o fluxo de auth do portal.
- Mudar RLS.