

# Plano: Portal Premium "Meu Espaço"

Priorizado por impacto na percepção de valor do usuário.

---

## Fase 1 — Alto Impacto Visual (maior retorno imediato)

### 1. Player de Áudio Custom Branded
Substituir os `<audio controls>` nativos do browser por um player customizado com visual AURA.
- Botão play/pause circular com gradiente lavender/sage
- Barra de progresso estilizada com cores da marca
- Display de tempo (atual / total)
- Componente reutilizável: `src/components/portal/AudioPlayer.tsx`
- Usado em Meditações e Cápsulas do Tempo

### 2. Skeleton Screens
Substituir "Carregando..." por skeletons animados que refletem o layout real do conteúdo.
- `PortalLoading` → skeleton com header + tabs + cards
- `PortalLoadingInline` → skeleton cards por aba

### 3. Header Emocional Contextual
Transformar a saudação estática em algo vivo:
- Saudação por período do dia ("Bom dia", "Boa tarde", "Boa noite")
- Frase motivacional rotativa (array de frases da Aura)
- Ícone decorativo com animação sutil (Sparkles com pulse)

---

## Fase 2 — Engajamento e Profundidade

### 4. Micro-Animações e Transições
- Fade-in nos cards ao entrar na aba (CSS `animate-fade-up` já existente)
- Transição suave ao trocar de aba (opacity transition)
- Hover effects nos cards (scale sutil + shadow)
- Stagger delay nos itens de lista

### 5. Badges e Marcos de Progresso
Seção visual no header ou na aba Jornadas mostrando conquistas:
- "Primeira Jornada Completa", "X dias consecutivos", "X meditações ouvidas"
- Badges como ícones circulares com cores diferentes
- Dados derivados de `journeys_completed`, `monthly_reports`, dados existentes

---

## Fase 3 — Refinamento

### 6. Refatoração em Componentes Modulares
Quebrar o monolito de 697 linhas:
- `src/components/portal/PortalHeader.tsx`
- `src/components/portal/PortalTabs.tsx`
- `src/components/portal/JornadasTab.tsx`
- `src/components/portal/ResumosTab.tsx`
- `src/components/portal/MeditacoesTab.tsx`
- `src/components/portal/CapsulasTab.tsx`
- `src/components/portal/AudioPlayer.tsx`
- `src/components/portal/shared.tsx` (EmptyState, MetricCard, SectionHeader)

### 7. Visualização de Evolução nos Resumos
Adicionar mini-gráficos nos resumos mensais usando `recharts` (já instalado):
- Barras horizontais para mensagens/insights/sessões comparando meses
- Só aparece quando há 2+ relatórios

---

## Detalhes Técnicos

- **Sem mudanças no banco de dados** — tudo usa dados existentes
- **Sem novas dependências** — recharts e Lucide já estão no projeto
- **CSS animations** já definidas em `index.css` (fade-up, fade-in, pulse-soft, float)
- **Mobile-first** mantido — todas as melhorias respeitam o layout atual
- Estimativa: ~8 arquivos novos/modificados

