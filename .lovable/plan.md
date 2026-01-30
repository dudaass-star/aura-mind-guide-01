
# Plano: Demo com Balões Múltiplos (Estilo Humano)

## Problema Identificado

Atualmente cada mensagem da AURA aparece em um único balão grande. Mas a AURA real conversa em **múltiplos balões curtos**, como humano no WhatsApp:

**Atual (errado):**
```
┌─────────────────────────────────────┐
│ Esse peso de "todo mundo parece     │
│ saber" é muito real... e muito      │
│ injusto com você mesma. Me conta:   │
│ quando você diz que não sabe o que  │
│ quer, é sobre trabalho?             │
│ Relacionamentos? Ou é algo mais     │
│ fundo?                              │
└─────────────────────────────────────┘
```

**Correto (estilo humano):**
```
┌─────────────────────────────┐
│ Esse peso de "todo mundo    │
│ parece saber" é muito real  │
└─────────────────────────────┘

┌─────────────────────────────┐
│ ...e muito injusto com      │
│ você mesma                  │
└─────────────────────────────┘

┌─────────────────────────────┐
│ Me conta: quando você diz   │
│ que não sabe o que quer,    │
│ é sobre trabalho?           │
│ Relacionamentos?            │
│ Ou é algo mais fundo?       │
└─────────────────────────────┘
```

## Conversa Reformulada

Vou quebrar as mensagens da AURA em balões curtos, mantendo o ritmo natural:

| # | Quem | Balão |
|---|------|-------|
| 1 | Usuária | Tenho 28 anos e ainda não sei o que quero da vida. Todo mundo parece ter um caminho, menos eu. |
| 2 | AURA | Esse peso de "todo mundo parece saber" é muito real... |
| 3 | AURA | ...e muito injusto com você mesma |
| 4 | AURA | Me conta: quando você diz que não sabe o que quer, é sobre trabalho? Relacionamentos? Ou é algo mais fundo? |
| 5 | Usuária | É tudo. Sinto que to só existindo, sabe? Não vivendo de verdade. |
| 6 | AURA | "Só existindo"... |
| 7 | AURA | isso diz muito |
| 8 | AURA | Deixa eu te perguntar uma coisa: teve algum momento recente, mesmo que pequeno, em que você sentiu que estava vivendo de verdade? |
| 9 | AURA | Pode ser algo simples |
| 10 | Usuária | Semana passada eu passei a tarde toda desenhando. Nem vi o tempo passar. |
| 11 | AURA | Olha só o que você acabou de me mostrar... |
| 12 | AURA | Você diz que não sabe o que quer |
| 13 | AURA | mas seu corpo sabe |
| 14 | AURA | Ele te levou pra um lugar onde o tempo sumiu |
| 15 | AURA | Isso não é "só existir" |
| 16 | AURA | Isso é uma pista enorme 💡 |

## Alteracoes Tecnicas

### Arquivo: `src/components/Demo.tsx`

**Mudancas na estrutura de dados:**

1. Reformular o array `messages` para ter cada balão como item separado
2. Adicionar propriedade `isSequence` para indicar balões consecutivos do mesmo remetente
3. O horário só aparece no último balão de cada sequência

**Mudancas na animacao:**

1. Balões consecutivos da AURA aparecem com delay menor (300-500ms entre eles)
2. O indicador "digitando..." aparece apenas antes do PRIMEIRO balão de cada sequência da AURA
3. Balões da mesma sequência têm espaçamento visual menor

**Mudancas visuais:**

1. Balões consecutivos usam `rounded-bl-sm` em vez de `rounded-bl-md` para indicar continuidade
2. Horário aparece apenas no último balão da sequência
3. Espaçamento reduzido entre balões da mesma pessoa (`space-y-1` em vez de `space-y-3`)

## Fluxo da Animacao

```text
[Usuária envia]
    |
    v
[AURA digitando...]  <- indicador aparece
    |
    v
[Balão 1 da AURA] <- aparece
    |
  300ms
    |
    v
[Balão 2 da AURA] <- aparece (sem "digitando")
    |
  300ms
    |
    v
[Balão 3 da AURA] <- aparece (com horário)
    |
    v
[Usuária envia próxima]
```

## Resumo das Alteracoes

| Arquivo | Alteracao |
|---------|-----------|
| `src/components/Demo.tsx` | Reformular array de mensagens para balões múltiplos, ajustar lógica de timing para sequências, ajustar espaçamento visual entre balões consecutivos |

## Resultado Esperado

O visitante verá a AURA respondendo exatamente como ela faz de verdade: em balões curtos, um após o outro, como uma pessoa real digitando no WhatsApp. Isso vai criar uma experiência muito mais imersiva e "UAU".
