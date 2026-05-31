## Diagnóstico

A regeneração nova **já gravou no banco** o retrato limpo (sem "Mentor: Aura", sem nota episódica da esposa, sem padrão de áudio/medicação). O que aparece no `/meu-espaco` é o **retrato antigo** que ficou em cache de carregamento anterior.

Causa: o `useEffect` atual só dispara a regeneração se o retrato não existe OU se está com mais de 24h. Como tinha sido gerado há minutos, ele não dispara — e o react-query mantém o objeto antigo até um remount completo.

**Sobre os "chips grudados"** (Conquistas e Temas): visualmente NÃO estão grudados (têm `gap-2.5` entre chips). É artefato de copy-paste — chips `inline-flex` adjacentes sem texto separador entre as tags HTML colam o texto ao copiar. No render real, há espaço entre eles. Não é bug.

---

## Ajuste único

**Arquivo:** `src/components/portal/SobreVoceTab.tsx`

Trocar o `useEffect` que dispara `generate-user-portrait`:

- **Antes:** só invoca se `!portrait || >24h`.
- **Depois:** invoca em todo mount. O backend já tem cache por hash dos `user_insights` + `session_themes` + `PROMPT_VERSION` — então quando os dados brutos não mudaram, ele retorna em milissegundos sem chamar LLM (custo zero). Quando mudaram (ou quando o `PROMPT_VERSION` muda), ele regenera. Refetch só roda se a resposta indicar `cached: false` OU se o `generated_at` difere do que está em tela.

Resultado: retrato sempre se auto-cura no próximo carregamento sem custo extra, e o Eduardo verá a versão limpa assim que recarregar.

## Fora de escopo

- Não vou mexer no prompt nem no `normalize` (já estão corretos — DB confirma).
- Não vou mexer nos estilos dos chips (não há bug visual real).
- Não vou tocar em outras abas do portal.
