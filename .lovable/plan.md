

## Plano: Regra Anti-CTA com Cooldown 30 dias + Tom Ultra-Suave

### Mudanças

**Arquivo: `supabase/functions/aura-agent/index.ts`**

#### 1. Prompt — Substituir seção "SUGESTAO PROATIVA" (linhas 1083-1090)

Substituir por regra inviolável com cooldown de 30 dias e tom obrigatoriamente suave:

```
## SUGESTAO PROATIVA DE UPGRADE (APENAS PLANO ESSENCIAL):

REGRA INVIOLÁVEL DE UPGRADE:
- Consulte "Último CTA de upgrade" nos DADOS DINÂMICOS antes de qualquer menção a planos.
- Se cooldown ativo (< 30 dias desde último CTA): NÃO mencione upgrade. Zero.
- Se o usuário recusou ("não tenho condições", "agora não", "não posso", "tá caro", "depois", "sem dinheiro"): aceite com carinho e siga. NÃO insista nesta conversa NEM nas próximas 30 dias.
- EXCEÇÃO ÚNICA: se o PRÓPRIO usuário perguntar sobre planos, responda normalmente.
- SO use a tag [UPGRADE:plano] quando o usuario CONFIRMAR que quer fazer upgrade.

QUANDO PUDER SUGERIR (cooldown expirado + usuário acima do target diário):
- A sugestão deve ser QUASE IMPERCEPTÍVEL. Nunca um pitch, nunca uma lista de benefícios.
- Integre organicamente na conversa, como quem comenta de passagem.
- Exemplo BOM: "Ah, e sabia que tem um jeito da gente conversar sem esse limite? Mas enfim, me conta mais sobre..."
- Exemplo BOM: "Se um dia quiser, tem como a gente ter esse espaço sem limite nenhum. Mas agora o importante é isso que você tá vivendo."
- Exemplo RUIM: "Que tal conhecer nossos planos? No plano Direção você tem..."
- Exemplo RUIM: "Tenho uma sugestão pra você: o plano Transformação oferece..."
- MÁXIMO 1 frase. Depois siga a conversa como se nada tivesse acontecido.
- Nos planos Direcao e Transformacao, o usuario pode mandar mensagens O QUANTO QUISER. Diga "pode falar comigo o quanto quiser, sem limite".
```

#### 2. Contexto Dinâmico — Injetar status de CTA (após linha ~3401)

Adicionar cálculo de cooldown e injetar no `dynamicContext`:

```typescript
const upgradeSuggestedAt = profile?.upgrade_suggested_at;
let upgradeCTAContext = 'Nenhum CTA recente — pode sugerir se apropriado e de forma quase imperceptível';
if (upgradeSuggestedAt) {
  const lastCTA = new Date(upgradeSuggestedAt);
  const daysSince = Math.floor((Date.now() - lastCTA.getTime()) / (86400000));
  if (daysSince < 30) {
    upgradeCTAContext = `Último CTA: ${lastCTA.toLocaleDateString('pt-BR')} (há ${daysSince} dias) — cooldown ativo até ${new Date(lastCTA.getTime() + 30*86400000).toLocaleDateString('pt-BR')}. NÃO sugira upgrade.`;
  } else {
    upgradeCTAContext = `Último CTA: há ${daysSince} dias — cooldown expirado, pode sugerir de forma quase imperceptível`;
  }
}
```

Na string do dynamicContext, após "Histórico de conversas":
```
- Último CTA de upgrade: ${upgradeCTAContext}
```

#### 3. Atualizar `upgrade_suggested_at` quando CTA é enviado (após linha 4205)

Após `processUpgradeTags`, registrar o timestamp:

```typescript
if (profile?.id) {
  await supabase.from('profiles')
    .update({ upgrade_suggested_at: new Date().toISOString() })
    .eq('id', profile.id);
  console.log('📊 upgrade_suggested_at updated');
}
```

### Resumo
- 1 arquivo editado, ~30 linhas adicionadas/modificadas
- Campo órfão `upgrade_suggested_at` finalmente ativado
- Cooldown 30 dias enforced em 2 camadas (prompt + contexto dinâmico)
- Tom obrigatório: quase imperceptível, 1 frase máx, integrado na conversa
- Sem migração de banco necessária

