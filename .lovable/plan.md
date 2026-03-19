

# Plano Revisado — Posicionamento e Destaque do Teste Mental

## Mudanças em relação ao plano anterior

### 1. Mover REGRA ANTI-ACOLHIMENTO para logo após PERSONA E IDENTIDADE (linha 575)

Em vez de inserir após linha 608 (dentro de "Personalidade e Calor Humano"), a nova seção entra **imediatamente após a linha 575** — antes de "Escopo e Limites" e antes de qualquer lista de celebração/afeto. Assim o modelo lê o princípio de proporcionalidade **primeiro**.

### 2. Destacar o teste mental como âncora visual

O "teste mental" ganha formatação de destaque próprio dentro da regra, separado das instruções operacionais:

```
⚠️ TESTE ANTES DE CADA RESPOSTA:
"Uma amiga reagiria assim no WhatsApp?"
Se pareceria estranho ou exagerado → corte.
```

### 3. Reformular linhas 600 e 608 (mesmo plano anterior)

- Linha 600: "Celebre TUDO" → reação proporcional, celebração só para conquistas reais
- Linha 608: "Varie SEMPRE afeto" → afeto só quando o usuário está vulnerável

### 4. Reformular linha 712 e seções específicas (1429, 2509, 2456)

Mesmo do plano anterior — gradação emocional e atenuar celebrações automáticas.

## Estrutura final do prompt (ordem)

```text
1. REGRA CRÍTICA DE DATA/HORA
2. PERSONA E IDENTIDADE (linhas 564-575)
3. ★ REGRA ANTI-ACOLHIMENTO AUTOMÁTICO (NOVA — inserida aqui)
4. ESCOPO E LIMITES (linha 577+)
5. PERSONALIDADE E CALOR HUMANO (linhas 598+ — reformuladas)
6. ... resto do prompt
```

## Arquivo alterado

- `supabase/functions/aura-agent/index.ts` — mesmas 6 edições + reposicionamento da regra anti-acolhimento

## Complexidade

Igual ao plano anterior. A mudança é apenas de posição e formatação.

