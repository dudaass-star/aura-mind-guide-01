

# Unificar conclusão de jornada dentro da página do episódio

## Problema atual

O `periodic-content` envia **duas mensagens separadas** no WhatsApp:
1. O EP8 como texto (manifesto gerado)
2. Uma segunda mensagem de parabéns com link para `/jornada-completa`

O usuário quer: **uma única mensagem** com o link do EP8, e dentro da página do EP8 (após o conteúdo), os parabéns + cards de escolha da próxima jornada.

## Solução

### 1. `src/pages/Episode.tsx` — Adicionar seção de conclusão no último episódio

- Detectar se `episode.episode_number === totalEpisodes`
- Se for o último, após o conteúdo do episódio, renderizar:
  - Mensagem de parabéns (mesmo visual do `JourneyComplete.tsx`)
  - Cards clicáveis com as jornadas disponíveis
  - Ao clicar, chamar `choose-next-journey` diretamente (sem confirmação)
  - Tela de sucesso após escolha
- A página precisa receber o `userId` para poder chamar a edge function — passar via query param na URL: `/episodio/:id?u=<userId>`

### 2. `supabase/functions/periodic-content/index.ts` — Remover envio separado de conclusão

- No bloco `isLastEpisode`: **remover** o envio da segunda mensagem (completionMessage + sendProactive)
- Manter a atualização do perfil (`current_journey_id = null`, incremento de `journeys_completed`)
- O EP8 já é enviado normalmente como link (teaser + link para `/episodio/:id?u=userId`) — não precisa mudar nada no envio do episódio em si
- Apenas incluir o `?u=userId` na URL do episódio quando for o último

### 3. `src/pages/JourneyComplete.tsx` — Manter como fallback

- A página continua existindo para o fallback de 48h ou links já enviados
- Sem alterações necessárias

## Fluxo resultante

```text
periodic-content detecta EP8 (último)
  → Gera manifesto normalmente
  → Envia UMA mensagem: teaser + link /episodio/:id?u=userId
  → Atualiza perfil: journey_id=null, journeys_completed++
  → Usuário abre link → vê EP8 + parabéns + cards de escolha
  → Clica na jornada → choose-next-journey atualiza perfil
```

## Arquivos modificados

| Arquivo | Mudança |
|---|---|
| `src/pages/Episode.tsx` | Adicionar seção de conclusão + escolha quando é último EP |
| `supabase/functions/periodic-content/index.ts` | Remover envio da 2ª mensagem; adicionar `?u=userId` na URL do EP quando for último |

