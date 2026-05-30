## Ajustes na aba "Sobre você"

Arquivo único: `src/components/portal/SobreVoceTab.tsx`.

### 1. Remover avatar
Header vira só `<h2>Oi, Eduardo</h2>` + subtítulo, sem círculo gradient nem ícone User.

### 2. Afrouxar a curadoria
**Remover da blacklist** (eram conteúdo legítimo de objetivo/padrão/preferência):
`habilidade`, `mentor`, `passo`, `passo_de_hoje`, `acao`, `fazer`, `sentir`, `desejo`, `quebrar_o_padrao`, `quebrar o padrão`, `autoconfianca`, `autoconfiança`, `retomar_treinos`, `prioridade`.

**Manter na blacklist** (operacional puro): audio, conversar_audio, confusao_texto_audio, compreensao_aura, compreensao_processo, continuar_conversando, interacao_anterior, topico_anterior, assunto_nao_discutir, recusa_de_ajuda, recusa_de_agendamento, mudanca_de_assunto, tipo_de_interacao, tipo_de_servico, estado, clima, localizacao, frase_ancora, jornada_concluida, tema_episodio, tema_principal, episodio*, pessoa_mencionada, interesse_em_sessoes, kit_*, estatistica_*.

`isGenericAiPhrase` continua filtrando valores genéricos ("fazer as coisas", "dar um passo", "conquistar um espaço novo") — atua só sobre o valor.

**minImportance** de objetivo/padrão/preferência: **6 → 4**.
**Limite por seção**: 5 → 6.

### 3. Pessoas mais permissivas
Chip de relação aparece **sempre** que a chave for reconhecida (`esposa`, `irma`, etc), mesmo sem nome próprio no valor:
- Com nome: label "Esposa" + "Maria"
- Sem nome próprio (valor é frase/evento): só label "Esposa", sem subtítulo

Limite sobe pra 8 chips.

### 4. Apresentação de objetivos/padrões/preferências
Cada item vira mini-card com a **chave em cima** (label `text-[10px] uppercase tracking-wider text-muted-foreground`) e o **valor abaixo** (texto normal). Padrões mantém o estilo blockquote/itálico.

Exemplo:
```
PASSO DE HOJE
Conquistar um espaço novo.

AUTOCONFIANÇA
Construir confiança no test drive.
```

### 5. Temas
Sem mudanças — já está visualmente correto.