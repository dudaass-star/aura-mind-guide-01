
## Plano: Página Admin para visualizar templates de e-mail

### Ideia
Em vez de abas simples, a melhor experiência é uma página no painel admin com uma **lista lateral dos templates** e um **preview visual do e-mail renderizado** ao lado. Funciona como um "email viewer" — clica no template à esquerda e vê o e-mail completo à direita, exatamente como ele chega na caixa de entrada do usuário.

Com apenas 3 templates hoje, isso é mais limpo que abas e escala melhor quando novos templates forem adicionados.

### O que será feito

**1. Nova edge function `admin-preview-emails`**
- Valida que o chamador é admin (JWT + verificação via `has_role`)
- Renderiza todos os templates registrados com seus `previewData`
- Retorna JSON com nome, assunto, displayName e HTML renderizado de cada template

**2. Nova página `/admin/emails`**
- Protegida por autenticação admin (mesmo padrão das outras páginas admin)
- Layout: lista de templates à esquerda, preview HTML à direita
- Cada card na lista mostra: nome do template, assunto, status (renderizado/erro)
- Ao clicar, exibe o HTML renderizado em um iframe seguro (sandbox)
- Botão de atualizar para recarregar

**3. Adicionar rota no App.tsx e link no AdminSettings**
- Nova rota `/admin/emails`
- Link de acesso na página de configurações admin

### Detalhes técnicos
- A edge function usa `createClient` com o JWT do usuário para verificar a role admin
- O HTML é exibido via iframe com `srcdoc` (sandbox) para isolamento seguro
- Reutiliza o registry de templates existente (`TEMPLATES` + `previewData`)
