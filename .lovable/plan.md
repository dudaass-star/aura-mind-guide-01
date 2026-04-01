

# Fluxo de Conclusão de Jornada — Escolha do Usuário via Página

## Situação Atual

As jornadas estão encadeadas automaticamente em ciclo fixo:
```text
Ansiedade → Autoconfiança → Procrastinação → Relacionamentos
→ Estresse → Luto → Medo de Mudança → Inteligência Emocional → (volta)
```

Quando o usuário termina uma jornada, o `periodic-content` já faz a transição automática para `next_journey_id` sem esperar resposta. A mensagem de "escolha" é enviada como texto no WhatsApp, mas o sistema não aguarda — já seta a próxima.

## Problema

- O usuário recebe opções mas a troca já aconteceu automaticamente
- Se o usuário não responder, tudo bem (já tem fallback automático)
- Mas se quiser escolher, precisa responder no WhatsApp e torcer que o `aura-agent` entenda

## Proposta: Página de Conclusão com Escolha + Fallback Automático

### Como funciona

1. **Ao concluir a jornada**, o sistema envia um teaser no WhatsApp com link para uma página de conclusão (mesmo padrão dos episódios)
2. **A página** mostra: parabéns, resumo da jornada concluída, e botões para escolher a próxima jornada
3. **Ao clicar num botão**, a página chama uma edge function que atualiza o `current_journey_id` do perfil
4. **Fallback automático**: se o usuário não escolher em 48h, o sistema aplica o `next_journey_id` padrão (já configurado na tabela)

### Arquivos a criar/modificar

1. **`src/pages/JourneyComplete.tsx`** — Nova página em `/jornada-completa/:odernada-id/:user-id`
   - Mostra parabéns + nome da jornada concluída
   - Lista todas as jornadas ativas como cards clicáveis
   - Ao clicar, chama edge function para atualizar o perfil
   - Visual consistente com a página de episódio (branding Aura)

2. **`src/App.tsx`** — Adicionar rota `/jornada-completa/:journeyId/:userId`

3. **`supabase/functions/choose-next-journey/index.ts`** — Nova edge function
   - Recebe `user_id` e `journey_id`
   - Valida que a jornada existe e está ativa
   - Atualiza `profiles.current_journey_id` e reseta `current_episode = 0`
   - Retorna sucesso

4. **`supabase/functions/periodic-content/index.ts`** — Modificar bloco de conclusão
   - Em vez de enviar mensagem longa no WhatsApp, gerar teaser + link para a página de conclusão
   - **Não** setar `current_journey_id` imediatamente — deixar `null` temporariamente
   - Incrementar `journeys_completed` e setar `last_content_sent_at`

5. **`supabase/functions/periodic-content/index.ts`** — Adicionar fallback automático
   - No início da execução, verificar perfis com `current_journey_id = null` e `last_content_sent_at` há mais de 48h
   - Para esses, aplicar o `next_journey_id` da jornada anterior automaticamente

### Fluxo resumido

```text
Jornada concluída
  → WhatsApp: "Parabéns! Escolha sua próxima jornada: [link]"
  → Página: cards com todas as jornadas disponíveis
  → Usuário clica → API atualiza perfil → próximo ciclo envia EP1 da escolhida
  → Não clicou em 48h? → sistema aplica next_journey_id padrão
```

### Segurança da página

A URL inclui o `user_id`, então a edge function `choose-next-journey` valida que o user_id existe e aplica a mudança via service role. Não requer autenticação (o usuário vem do WhatsApp, não tem login).

