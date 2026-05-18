## Diagnóstico

Os dois vícios vêm de instruções e **exemplos** que já existem no prompt do `aura-agent` e estão treinando o modelo a repetir fórmula. A correção é **enxugar e reescrever** o que já está lá — sem criar nova seção, sem novo bloco de regras.

### Vício 1 — "Puts/Eita/Xi, [nome]... [metáfora forte]"

Origem:
- **Linha 2244** — cardápio de interjeições (`"Caramba!", "Puxa vida...", "Eita!", "Puts!", "Xi!", "Aaah!"...`). Vira lista de sugestão pronta.
- **Linha 2410** — modo livre traz `Emoção genuína: "Eita..." / "Hmm..." / "Sério?"` como exemplo modelo.
- **Linha 5889** — LEMBRETE ANTI-ECO sugere literalmente começar com `"Eita...", "Hmm...", "Sério?"`.
- **Linhas 2423 / 2429 / 2234** — exemplos abrindo com "Eita" e com `[Olha, nome]...` reforçam o padrão vocativo.

### Vício 2 — repetir palavras curtas do usuário entre aspas

Origem:
- **Linha 3348** (encerramento de sessão): *"Devolva a percepção central com as palavras exatas que ele usou — sem reformular."* Instrução pensada só para o encerramento, mas o modelo generaliza para a conversa inteira e usa aspas para "preservar" termos.
- **Linha 1597** — referência genérica a "palavras dele/dela" que reforça o transbordo.

---

## Plano de ajuste (sem criar seções novas)

### 1. Linha 2244 — reescrever a regra das interjeições
- Tirar o cardápio. Substituir por **uma frase**: interjeição é tempero raro, não abertura; nunca repetir a mesma em respostas seguidas.
- Aproveitar o mesmo bloco para acrescentar **uma linha** sobre aspas: *"Não devolva entre aspas termos curtos que o usuário acabou de usar — vira eco."*

### 2. Linha 2410 — tirar os exemplos "Eita / Hmm / Sério"
- Manter o princípio ("reaja de forma viva sem fórmula"), mas sem listar palavras-modelo.

### 3. Linha 5889 — reescrever o LEMBRETE ANTI-ECO
- Substituir as sugestões `"Eita..."/"Hmm..."/"Sério?"` por uma instrução genérica: *"varie a forma de reagir; não comece com a mesma interjeição da resposta anterior."*

### 4. Linha 2234 — tirar o `[nome]` do exemplo
- Reescrever o modelo de resposta sem o vocativo, para parar de treinar o padrão `Interjeição, [nome]...`.

### 5. Linha 3348 — preservar a precisão, limitar o escopo
- Não bania "palavras exatas" — essa instrução existe por motivo real: sem ela o modelo parafraseia em linguagem clínica e perde o peso da fala do cliente. O problema é o transbordo + o uso de aspas.
- Nova redação (sugestão do usuário, adotada):

  > Devolva a percepção central com a linguagem que ele usou —
  > não com aspas literais, não parafraseada em linguagem clínica.
  > Isso vale só para o encerramento, não para a conversa inteira.

### 6. Linha 1597 — pequeno tweak de consistência
- Ajustar a referência a "palavras dele/dela" para deixar claro que **não** significa citar literal entre aspas no meio da conversa. Apenas alinhar com a regra do item 5.

### 7. Validação
- Deploy → conferir `failed_message_log` nos 10 min seguintes (drift Lovable→GH Actions).
- Olhar 10-15 conversas das próximas 24h. Sucesso = sumiço do padrão `Interjeição, [nome]...` e queda das aspas em termos curtos no meio da conversa, **sem** perder a precisão da fala do cliente no áudio de encerramento.
- Caso Cacia: a sessão de quarta (20/05) deve mostrar diferença perceptível.

---

## Arquivo tocado

- `supabase/functions/aura-agent/index.ts` — edições pontuais nas linhas 1597, 2234, 2244, 2410, 3348, 5889.

Sem migration. Sem nova seção. Sem mudança de fluxo, segurança ou máquina de estados.

## Risco
Baixo. São cortes e reescritas pequenas de tom dentro de blocos existentes. O único ponto sensível é a linha 3348 — preservada na intenção (precisão da fala do cliente no encerramento), restrita no escopo (só áudio final, sem aspas).
