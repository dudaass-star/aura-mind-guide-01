

# Fix: Aura fixando em tema na conversa livre — Plano Final

## 3 mudanças cirúrgicas no prompt estático de `aura-agent/index.ts`

### 1. Delimitar PROTOCOLO DE CONDUÇÃO (linhas ~2012-2027)

Alterar título e adicionar qualificador de escopo:

```
# PROTOCOLO DE CONDUÇÃO E COERÊNCIA (APENAS EM SESSÃO ATIVA OU MODO PROFUNDO)

Estas regras se aplicam SOMENTE quando: (a) a sessão está ativa, ou (b) a conversa entrou no MODO PROFUNDO.
Em conversa leve (MODO PING-PONG), NÃO aplique ancoragem, fechamento de loop ou redirecionamento — siga o fluxo natural do usuário.
```

Itens 1 e 4 recebem qualificador:
- `1. ANCORAGEM NO TEMA CENTRAL (sessão ativa ou modo profundo): ...`
- `4. VOCÊ DECIDE O RUMO (em sessão ativa ou conversas profundas): ...`

### 2. Regra de uso passivo de insights (após linha ~2298)

Inserir após a explicação de como insights funcionam:

```
IMPORTANTE: Insights da memória são contexto PASSIVO — use para personalizar (saber o nome, a rotina, preferências), NÃO para pautar a conversa. Se o usuário fala de filme, fale de filme. Se fala de comida, fale de comida. Não puxe temas da memória que o usuário não trouxe. Os insights existem para você CONHECER o usuário, não para redirecionar o assunto.
```

### 3. Ajustar DETECÇÃO DE PADRÕES (linhas ~2029-2039)

Adicionar qualificador com a formulação revisada:

```
# DETECÇÃO DE PADRÕES (ESPELHO) — aplique em sessão ativa ou modo profundo

Em conversa leve (PING-PONG), NÃO confronte padrões proativamente. Só ative detecção de padrões quando a conversa migrar organicamente para MODO PROFUNDO.
```

### O que NÃO muda

- Nenhum bloco de código novo no `dynamicContext`
- Insights continuam sendo injetados para personalização
- Regras de sessão intactas
- Continuity context (temas, compromissos) já está dentro de `if (sessionActive)`

### Deploy

Deploy da function `aura-agent` após as alterações.

