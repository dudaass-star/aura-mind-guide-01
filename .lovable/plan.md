
Diagnóstico:
- O código no repositório já está correto: o branch `google/*` usa `generateContent` com `x-goog-api-key`.
- Mas os logs em produção ainda mostram a versão antiga:
  - aparece `🔀 Routing to Gemini API direct`
  - não aparece `🔀 Routing to Gemini native API`
  - não aparece `🔑 GEMINI_API_KEY prefix`
  - não aparece `✅ Gemini native API success`
- Portanto, o problema atual não é mais de lógica do código. É de runtime/deploy: a função `aura-agent` ativa ainda está executando código antigo.

O que implementar:
1. Forçar um redeploy limpo de `aura-agent`
   - Objetivo: garantir que a função ativa passe a usar exatamente o código atual do repositório.
   - Como validação, a próxima execução precisa mostrar os novos logs:
     - `🔑 GEMINI_API_KEY prefix:`
     - `🔀 Routing to Gemini native API`
     - `✅ Gemini native API success`

2. Se o redeploy falhar ou continuar preso em versão antiga, revisar artefatos de deploy
   - Verificar se existe algum problema de build/deploy impedindo atualização real da função.
   - Como não há `deno.lock` no projeto, a principal hipótese continua sendo drift de deployment no ambiente, não lockfile.

3. Validar o fluxo após o redeploy
   - Enviar nova mensagem no WhatsApp
   - Conferir se:
     - `webhook-zapi` chama `aura-agent`
     - `aura-agent` entra no branch nativo
     - some o 401
     - aparece resposta enviada ao usuário

4. Só se ainda houver erro após o runtime novo entrar
   - Inspecionar o formato exato da chamada nativa em produção
   - Verificar se a credencial carregada no runtime é a esperada
   - Aí sim investigar problema de autenticação/configuração residual

Conclusão:
- O bug agora é “deploy desatualizado”, não “integração Gemini incorreta”.
- O próximo passo correto é um plano de recuperação do deployment da `aura-agent`, não mexer novamente no branch Google.

Detalhes técnicos:
- Evidência no código: `supabase/functions/aura-agent/index.ts` linhas 238–319 já contêm a implementação nativa.
- Evidência nos logs: a produção ainda registra a string antiga `Routing to Gemini API direct`, incompatível com o arquivo atual.
- Isso confirma divergência entre código do repo e código em execução.
