
## Diagnóstico

A aba está mostrando dados crus da `user_insights` porque o filtro é só por `importance`. Isso joga tudo que tem `importance=10` na "Identidade" (incluindo lixo como `habilidade: fazer as coisas`, `audio: confirmar...`, `continuar_conversando: true`) e deixa "Valores" quase vazio (quase nada tem 7–9).

A tabela já tem um campo `category` com 7 valores fixos:

| category | count | uso |
|---|---|---|
| contexto | 6861 | operacional/efêmero — **não mostrar** |
| preferencia | 3054 | preferências e gostos |
| pessoa | 2265 | pessoas da vida |
| padrao | 1443 | padrões de comportamento |
| objetivo | 1216 | metas e direções |
| trauma | 1052 | pontos sensíveis |
| conquista | 604 | vitórias |

O bug visível ("Temas em movimento" aparecendo concatenado, ex.: `ansiedadeAnsiedade...`) também é dado duplicado por caixa (`ansiedade` e `Ansiedade` viraram dois temas diferentes).

## O que muda

Só `src/components/portal/SobreVoceTab.tsx`. Sem migration, sem edge function, sem mexer no extractor.

### Nova estrutura de seções (orientada por `category`, não por `importance`)

1. **Pessoas da sua vida** — `category = 'pessoa'`
2. **Preferências e gostos** — `category = 'preferencia'` AND `importance >= 6`
3. **O que você busca** — `category = 'objetivo'` AND `importance >= 6`
4. **Padrões que a Aura percebeu** — `category = 'padrao'` AND `importance >= 6`
5. **Conquistas** — `category = 'conquista'`
6. **Pontos sensíveis** — `category = 'trauma'` (colapsado por padrão, expansível, com aviso "tópicos delicados")
7. **Temas em movimento** — `session_themes`, deduplicados

`category = 'contexto'` nunca aparece.

### Limpeza por item (aplicada antes de agrupar)

Descarta o registro se qualquer uma:

- `value` vazia, só whitespace, ou ≤ 2 caracteres
- `value` é placeholder: `nao_nomeada`, `não nomeada`, `n/a`, `null`, `true`, `false`, `sim`, `não`, ou só dígitos
- `key` está no blacklist de chaves operacionais: `audio`, `conversar_audio`, `confusao_texto_audio`, `compreensao_aura`, `compreensao_processo`, `continuar_conversando`, `interacao_anterior`, `topico_anterior`, `assunto_nao_discutir`, `recusa_de_ajuda`, `recusa de ajuda`, `mudanca de assunto`, `tipo de interação`, `tipo de serviço`, `estado`, `clima`, `localizacao`, `kit_*`, `frase_ancora`, `estatistica_*`, `episodio_*`, `jornada_concluida`, `tema_episodio`, `tema_principal`
- `value` começa com `EP ` (referência de episódio)

### Deduplicação

- Por seção, agrupa por `lower(trim(key))` e mantém o registro com maior `importance`; empate desempata pelo `last_mentioned_at` mais recente.
- Para `pessoa`: se mesma `key` aparece com valores diferentes (ex.: `filha: Selena` e `filha: Bella`), agrega em uma linha "filha: Selena, Bella" (até 3 valores).
- `session_themes`: dedup case-insensitive em `theme_name`, soma `session_count`, mantém pior `status` (active > resolved).

### Apresentação

- Cada item vira uma linha mais legível: chave em title case sem underscore (`relacionamento_amoroso` → `Relacionamento amoroso`), valor em texto normal.
- Limite de 8 itens por seção com botão "Ver mais" pra expandir.
- Se a seção fica vazia após filtros, ela some.
- Empty state geral só aparece se TODAS as seções estiverem vazias.
- Botão "Corrigir no WhatsApp" permanece em cada item.

### Temas em movimento

- Render continua em pills (já está com `flex flex-wrap gap-2`, o "concatenado" do print é só copy-paste).
- Adiciona dedup por `lower(theme_name)` pra eliminar `ansiedade` vs `Ansiedade`.
- Resolvidos ficam no fim, riscados.

## Fora de escopo

- Curador via Gemini Flash-Lite escrevendo um "resumo do usuário". Vale fazer depois se você quiser uma versão narrativa ("A Aura te enxerga como..."), mas pode ser uma fase posterior — a limpeza acima já resolve o que tá feio agora.
- Mudar como o agente popula `user_insights` (corrige o problema na raiz, mas é prompt change separado).
