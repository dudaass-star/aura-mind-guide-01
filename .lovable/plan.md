## Diagnóstico

### 1. Meditação (imagem 1) — já está funcionando

Logs do `send-meditation` mostram entrega completa **hoje 17:02 BRT** para o telefone do Luiz (`+55 69 99825-5570`):

- Intro enviado via Twilio (free text, 24h aberta) — SID `SM4ee10cd9...`
- Áudio enviado via Twilio (URL pública do storage) — SID `MM23d4132c...`
- Categoria: `foco` → `med-foco-clareza` ("Clareza Mental")

A imagem do Luiz é compatível com isso (intro chegou; o balão de áudio provavelmente está fora do print, abaixo). **Conclusão: o fluxo está rodando.** O teste anterior dele foi antes do deploy. Nenhuma ação de código necessária aqui — só confirmar pro Luiz que está OK e pedir pra ele rolar o WhatsApp pra baixo do print.

### 2. Portal `/meu-espaco` — Luiz trava em "Confirma seu WhatsApp" (imagem 2)

Profile existe: `user_id=6c88c2a1...`, `email=luiz.junior@fogas.com.br`, `phone=556999825570`.

Fluxo atual em `link-portal-account`:
1. Login Google → `runLink()` sem body.
2. Lookup por email do Google. Se Luiz logou com Gmail pessoal (≠ `luiz.junior@fogas.com.br`), não acha → retorna `needs_phone` → mostra `PhoneLinkPrompt`.
3. Usuário digita `(69) 9 9825-5570` → `runLink(phone)` → busca por variações de telefone → deveria achar `556999825570`.
4. Profile encontrado tem `user_id=6c88c2a1` (UUID gerado pelo fluxo WhatsApp, **não é um `auth.users` real**). `getUserById(6c88c2a1)` provavelmente retorna vazio → `lastSignIn` falsy → segue pro update → deveria retornar `linked:true`.

Pelos analytics, vejo 6 POSTs `200` recentes em `link-portal-account` (várias tentativas do Luiz), mas **sem nenhum `console.log` capturado** — a função só loga no caminho de sucesso final (`✅ Linked...`) e em erros. Os retornos `linked:false` (no_profile / phone_taken) e o caminho de update bem-sucedido por phone passam mudos. Por isso não dá pra dizer **qual ramo** está disparando sem instrumentar.

Suspeitas mais prováveis:
- **(A)** Email lookup encontra o profile, mas o `update` falha silenciosamente por algum motivo (RLS / constraint) — improvável porque usa service role.
- **(B)** Phone lookup não casa porque Luiz está digitando formato diferente (ex.: sem DDD, com DDI duplicado, ou outro número). `normalizeBrazilianPhone` cobre bem, mas vale logar o que chegou.
- **(C)** O profile foi achado mas o ramo `phone_taken` disparou (porque `getUserById` do user_id antigo retornou algo com `last_sign_in_at`).
- **(D)** Caso de fato `no_profile` (telefone digitado errado), mas a UI mostra a mensagem certa "Não encontramos esse número" — então o Luiz veria erro, não ficaria mudo.

## Plano

### Mudança 1 — `supabase/functions/link-portal-account/index.ts`: instrumentar e blindar

Adicionar `console.log` estruturado em cada ramo decisivo (sem logar PII completo — só prefixo do email + últimos 4 dígitos do phone):

- Entrada: `newUserId`, `email` (mascarado), `phoneInput` presente?
- Resultado do lookup por email: hit/miss + `legacy.id`/`legacy.user_id` (sem expor email).
- Resultado do lookup por phone: `variations.length`, hit/miss.
- Ramo `phone_taken`: logar `existingUser?.user?.id` e `last_sign_in_at`.
- Update: sucesso/erro.
- Retorno final: `{linked, reason, matchedBy}`.

Blindagem extra:
- No ramo `phone_taken`, exigir **também** que o `auth.users.id` legado seja UUID real (já tá) **E** que tenha `last_sign_in_at` **dentro dos últimos 30 dias**. Profile órfão de token antigo (que nunca foi logado recentemente) não deve bloquear o vínculo legítimo. Hoje basta ter qualquer `last_sign_in_at` pra bloquear — risco de falso positivo.

### Mudança 2 — `src/components/portal/PhoneLinkPrompt.tsx`: feedback de erro melhor

- Adicionar console.warn com o `result` recebido (pra ele me mandar print do DevTools se ainda travar).
- Mensagens de erro permanecem iguais; nada visual muda além disso.

### Out of scope

- `meditation`, `support-agent`, `support-execute-action`, RLS, schema, UI do `UserPortal`.
- Refactor maior do `link-portal-account` ou do `PortalAuthContext`.

### Validação

1. Deploy.
2. Pedir pro Luiz tentar de novo no portal.
3. Ler `supabase--edge_function_logs` de `link-portal-account` → ver exatamente qual ramo dispara.
4. Se for `phone_taken`, ver `last_sign_in_at` do user antigo no log e decidir se relaxa mais a regra ou faz cleanup manual.
5. Se for `no_profile`, ver o que ele digitou (últimos 4 dígitos) vs `556999825570` esperado.

### Memória

Atualizar `mem/features/support/portal-access-resolution.md` com uma nota curta sobre a regra de `phone_taken` (janela de 30 dias).
