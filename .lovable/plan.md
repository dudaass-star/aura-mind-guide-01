

## Guia de Utilização da AURA — Plano Atualizado

Boa observação! O guia precisa cobrir **todas** as funcionalidades que o usuário tem acesso. Vou expandir o conteúdo.

### Seções do guia (`/guia`)

1. **Bem-vinda** — Saudação + visão geral do que a AURA oferece
2. **Como conversar** — Texto e áudio, 24/7, dicas de temas
3. **Sessões Especiais** (planos Direção/Transformação):
   - Tipos: Clareza, Padrões, Propósito, Livre
   - Como agendar (basta dizer dia e horário)
   - **Trocar data/horário** — pedir para a AURA reagendar
   - **Pausar sessões** — pedir pausa temporária (ex: "pausa minhas sessões por 2 semanas")
   - Resumo escrito após cada sessão
4. **Jornadas de Conteúdo** — Episódios semanais personalizados (terças e sextas), temas como autoconfiança, ansiedade, etc., progressão automática entre jornadas
5. **Relatório Semanal** — Review de evolução enviado todo domingo às 19h, métricas + análise qualitativa
6. **Check-in de Humor** — Check-in semanal às segundas
7. **Meditações Personalizadas** — Como a AURA escolhe e envia meditações
8. **Dicas para melhor experiência** — Ser honesto, manter constância, usar áudio, pedir ajuda específica
9. **FAQ rápido** — Pausar assinatura, cancelar, dados seguros
10. **CTA** — Voltar ao WhatsApp e começar

### Arquivos

- **Criar**: `src/pages/UserGuide.tsx` — página completa, responsiva, identidade visual AURA (sage/lavender/blush)
- **Editar**: `src/App.tsx` — adicionar rota `/guia`

### Design

- Cards com ícones Lucide para cada seção
- Seções com fundos alternados (bg-background / bg-card)
- Accordion para FAQ
- Tipografia consistente (Libre Baskerville + Nunito)
- Mobile-first, responsivo
- Sem necessidade de autenticação (página pública)

### Integração futura

Após criação, o link pode ser adicionado à mensagem de boas-vindas no `stripe-webhook` e `start-trial`.

