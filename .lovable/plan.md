

## Plano: Redesign do "Meu Espaço" — visual refinado + conteúdo acessível

### Resumo

Redesign completo da página do portal: remover emojis, melhorar visual com ícones Lucide, e mudar a lógica de dados para mostrar conteúdo acessível (episódios liberados clicáveis, todas as meditações disponíveis com áudio).

### Mudanças visuais (todo o arquivo `UserPortal.tsx`)

1. **Remover todos os emojis** — substituir por ícones Lucide React (`Target`, `BarChart3`, `Headphones`, `Heart`, `Play`, `Lock`, `CheckCircle2`, `Clock`, `MessageCircle`, `Brain`, `Calendar`, `Mail`)
2. **Tabs** — ícones Lucide ao invés de emojis nas abas
3. **Cards** — bordas mais suaves, gradientes sutis no header dos cards, sombras leves
4. **Header/Greeting** — visual mais limpo, sem emoji no "Oi, {nome}"
5. **Footer** — sem emoji
6. **Empty states** — ícones Lucide grandes e estilizados ao invés de emojis gigantes
7. **Audio player** — estilizar com wrapper visual (card com ícone play)

### Mudanças de lógica/dados

**Jornadas (tab "Jornadas"):**
- Mostrar **apenas a jornada atual** do usuário com destaque
- Para cada episódio (1 a `current_episode`), mostrar card clicável que linka para `/episodio/{episodeId}?u={userId}`
- Episódios acima de `current_episode` aparecem bloqueados (ícone Lock, opacidade reduzida)
- Buscar `journey_episodes` filtrado pelo `current_journey_id` do perfil

**Meditações (tab "Meditações"):**
- Ao invés de mostrar só o histórico do usuário, mostrar **todas as meditações ativas** com áudio disponível
- Agrupar por categoria (Ansiedade, Sono, Foco, etc.)
- Cada meditação mostra título, duração, descrição e player de áudio inline
- São apenas 6 meditações com áudio — todas ficam visíveis

**Resumos (tab "Resumos"):**
- Manter lógica atual (já mostra todos os resumos do usuário)
- Apenas trocar emojis por ícones Lucide nos MetricCards

**Cápsulas (tab "Cápsulas"):**
- Manter lógica atual
- Trocar emojis por ícones Lucide

### Arquivo alterado

| Arquivo | Ação |
|---------|------|
| `src/pages/UserPortal.tsx` | Rewrite completo — visual + lógica |

### Detalhes técnicos

- Nova query em JornadasTab: buscar `journey_episodes` WHERE `journey_id = current_journey_id` ORDER BY `episode_number`
- Nova query em MeditacoesTab: buscar `meditations` WHERE `is_active = true` + JOIN com `meditation_audios` para pegar URLs
- Episódios clicáveis linkam para `/episodio/{episode.id}?u={userId}` (rota já existe)
- Categorias de meditação mapeadas para labels em português e ícones

