
# Navegação unificada do Admin

Hoje cada página `/admin/*` é independente e a única forma de pular entre elas é digitar a URL. Vou criar uma **sidebar fixa** que aparece em todas as rotas admin, com link pra cada seção, destaque na rota ativa e botão de colapsar (mini-rail com ícones) pra não roubar espaço em telas menores.

## Como vai funcionar

- Sidebar à esquerda em **todas as rotas `/admin/*`** (exceto `/admin/login`).
- Estado **expandido (~240px)** com ícone + rótulo, ou **colapsado (~56px)** só com ícones e tooltip no hover.
- Rota ativa destacada (cor + barra lateral).
- Botão de toggle no header sempre visível, mesmo colapsada.
- Persistência do estado (expandido/colapsado) em `localStorage`.
- Grupos lógicos pra reduzir o ruído visual:

```text
GERAL
  • Dashboard / Engajamento     /admin/engajamento
  • Usuários                    /admin/usuarios
  • Sessões                     /admin/sessoes

MENSAGERIA
  • Mensagens (inbox)           /admin/mensagens
  • Inbox Recuperação           /admin/whatsapp-inbox
  • Templates WhatsApp          /admin/templates
  • E-mails                     /admin/emails
  • Instagram                   /admin/instagram

SUPORTE
  • Conversas                   /admin/suporte
  • Base de conhecimento        /admin/suporte/conhecimento
  • Gaps                        /admin/suporte/gaps

CONTEÚDO
  • Meditações                  /admin/meditacoes
  • Testes                      /admin/testes
  • Preview Popup               /admin/popup-preview

INFRA
  • Instâncias                  /admin/instancias
  • Configurações               /admin/configuracoes
```

(Ordem/grupos ajustáveis — me fala se quiser mover algo.)

## Detalhes técnicos

1. **`src/components/admin/AdminLayout.tsx`** (novo) — usa `SidebarProvider` + `Sidebar` do shadcn, com `collapsible="icon"`. Renderiza header fino com `SidebarTrigger` + título da página atual e `<Outlet/>` (ou `{children}`) pro conteúdo.
2. **`src/components/admin/AdminSidebar.tsx`** (novo) — grupos acima, ícones do `lucide-react`, `NavLink` do react-router pra detectar rota ativa, oculta itens se `!isAdmin`. Usa `useAdminAuth` só pra esconder a sidebar enquanto carrega / redirecionar do login.
3. **`src/App.tsx`** — envolver todas as rotas `/admin/*` (menos `/admin/login`) num route pai que renderiza `<AdminLayout/>`, mantendo cada página atual como filha. Sem refatorar o conteúdo das páginas — só remover headers/botões "voltar" duplicados onde a sidebar substitui (opcional, posso deixar pra depois).
4. **`useAdminAuth`** — reaproveitado, sem mudanças. Cada página continua chamando `redirectIfNotAdmin()`; a sidebar só renderiza quando `isAdmin === true`.
5. **Mobile** — sidebar vira drawer (comportamento padrão do shadcn `Sidebar`), aberto pelo `SidebarTrigger` no header.

## Fora de escopo

- Nada de mudar lógica de cada página, permissões ou rotas existentes.
- Não removo as páginas antigas, só passam a viver dentro do layout.
- Sem mudanças no portal `/meu-espaco` nem nas páginas públicas.

## Perguntas rápidas (opcional, posso decidir sozinho)

- Agrupamento acima te serve, ou prefere lista plana?
- Quer que eu remova os botões "voltar" e headers redundantes das páginas agora, ou deixo pra um segundo passe?
