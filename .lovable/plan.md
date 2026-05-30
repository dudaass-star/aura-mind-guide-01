## Problema

A aba "Sobre você" ainda mostra ruído ("Habilidade: fazer as coisas", "Mentor: Aura", "Nome" como pessoa, "Autoconfiança: construir", "Fazer: as coisas sem medo"), e o formato é uma lista de cards key:value que não conta nenhuma história sobre o usuário — parece um dump de banco.

## Objetivo

1. Filtragem mais agressiva: só mostrar o que realmente diz algo sobre o usuário.
2. Reformatar visualmente: deixar de ser uma listagem de pares e virar um **retrato pessoal** com hierarquia, agrupamentos visuais e densidade variada.

Sem mudanças de backend, extractor ou banco. Só `src/components/portal/SobreVoceTab.tsx`.

---

## Mudanças de conteúdo (curadoria)

**1. "Pessoas da sua vida" vira só pessoas de verdade.**
- Whitelist de chaves de relação: `filha`, `filho`, `esposa`, `marido`, `parceira`, `parceiro`, `mae`, `pai`, `irma`, `irmao`, `sobrinha`, `sobrinho`, `amiga`, `amigo`, `chefe`, `colega`, `ex`, `namorada`, `namorado`, `avo`, `avó`, `tia`, `tio`, `cunhada`, `cunhado`, `sogra`, `sogro`, `prima`, `primo` (com sufixos numéricos tipo `filha_1`).
- Item só entra se o **valor for um nome próprio** (regex: começa com maiúscula, sem espaços longos, sem verbo). Descarta valores como "ficou brava com o débito automático" — isso é evento, não pessoa.
- "Nome: Eduardo" vira o **nome do usuário no topo da aba** (cabeçalho "Oi, Eduardo"), não item de lista.
- Agrega filha_1, filha_2, filha → "Filhas: Bella, Selena".

**2. Blacklist adicional de chaves "vazias".**
- `habilidade`, `mentor`, `passo`, `passo_de_hoje`, `acao`, `fazer`, `sentir`, `desejo`, `quebrar_o_padrao`, `quebrar o padrão`, `autoconfianca`, `autoconfiança`, `retomar_treinos`, `prioridade`, `interesse_em_sessoes`, `interesse em sessões`, `assunto_nao_discutir`, `recusa_de_agendamento`.
  - Motivo: ou são instruções operacionais do agente, ou valores derivados de uma fala única sem virar padrão. Se for relevante, vira tema (session_themes), não insight permanente.
- Valor mínimo: descartar valores >120 caracteres (são frases de sessão, não atributos).
- Descartar valores que começam com verbo no infinitivo seguido de "as coisas / um passo / um espaço" (padrões genéricos da IA).

**3. Limite de qualidade.**
- Cada seção limita a **5 itens** (em vez de 8), ordenados por `importance` + `mentioned_count`. "Ver mais" só aparece se sobrar muito.
- Seção só renderiza se tiver ≥1 item após curadoria.

**4. Temas em movimento.**
- Bug visual atual: tags grudadas. Forçar `inline-flex items-center` no badge e garantir `gap-2` no wrap.
- Mostrar no máximo 12 temas, priorizando `status='active'`.
- Resolved fica numa linha separada abaixo, em opacidade reduzida, com label "Já trabalhados".

---

## Mudanças visuais (retrato, não lista)

Trocar o layout `space-y-6` de seções idênticas por uma composição com hierarquia:

```text
┌──────────────────────────────────────────┐
│  Avatar circular     Oi, Eduardo         │  ← header com nome
│  (gradient)          O que a Aura sabe…  │
└──────────────────────────────────────────┘

┌─ Pessoas da sua vida ────────────────────┐
│  [chip-pessoa] [chip-pessoa] [chip-…]    │  ← chips arredondados com
│   Filhas        Esposa                   │     ícone + label + nome
│   Bella, Selena Maria                    │
└──────────────────────────────────────────┘

┌─ O que te move ──────────────────────────┐   ← objetivos como
│  • frase curta destacada                 │     "highlights" em prosa,
│  • frase curta destacada                 │     não key:value
└──────────────────────────────────────────┘

┌─ Padrões que a Aura percebeu ────────────┐
│  citação em itálico…                     │   ← formato blockquote
│  citação em itálico…                     │
└──────────────────────────────────────────┘

┌─ Conquistas ─ Trophy  ───────────────────┐
│  badges horizontais                      │
└──────────────────────────────────────────┘

┌─ Pontos sensíveis (colapsado) ▾ ─────────┐
└──────────────────────────────────────────┘

[ Temas em movimento ]  chips ativos
[ Já trabalhados ]      chips resolvidos
```

Detalhes:
- **Pessoas** vira grid de "chips" 2-col no mobile (`grid grid-cols-2 gap-2`), cada chip com ícone Users pequeno + label do parentesco em cima + nome embaixo. Não usa formato linha key:value.
- **Objetivos** e **Padrões** ficam como bullets em prosa — só o valor, sem prefixo "Chave:" (a chave era ruído). Cada bullet vira frase com primeira letra maiúscula e ponto final.
- **Conquistas** vira badges/pills horizontais com ícone Trophy.
- **Sensíveis** continua colapsado por padrão.
- **Temas**: dois grupos separados (ativos colorido, resolvidos cinza) com label entre eles, garantindo `flex flex-wrap gap-2` real.
- Header da aba mostra "Oi, {nome}" se houver `nome` extraído da curadoria de pessoas.
- "Corrigir com a Aura" deixa de ser ícone por linha (poluído) e vira **um único link no rodapé da aba** apontando pro WhatsApp ("Algo aqui não bate? Me corrige no WhatsApp →").

---

## Arquivos

- `src/components/portal/SobreVoceTab.tsx` — único arquivo afetado, rewrite completo.

Sem migrations, sem mudanças no extractor, sem mudanças em outros tabs.