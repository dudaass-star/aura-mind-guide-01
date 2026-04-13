
Diagnóstico

- Verifiquei o código atual de `supabase/functions/create-checkout/index.ts`: ele já está com `request_three_d_secure: 'any'`.
- Procurei no projeto inteiro e só existe 1 ocorrência de `request_three_d_secure`, então não há um segundo arquivo reaplicando `'always'`.
- Verifiquei também o frontend em `src/pages/Checkout.tsx`: o botão “Contratar” chama apenas a função `create-checkout` e envia `trial: true`, então o erro continua vindo exatamente dessa função.
- Os logs mais recentes da função em execução ainda mostram o erro antigo:
  - `2026-04-13T17:22:47Z`
  - `2026-04-13T17:22:56Z`
  - `2026-04-13T17:26:02Z`
  com a mensagem:
  `Invalid payment_method_options[card][request_three_d_secure]: must be one of any, challenge, or automatic`

Conclusão

- O problema não está mais no código do repositório.
- O problema é que a função que está rodando no backend ainda está desatualizada / não pegou a correção corretamente.
- Então não foi a mudança do Instagram que causou isso; o erro atual é um mismatch entre código salvo e função efetivamente implantada.

Plano de implementação

1. Forçar um novo deploy da função `create-checkout` usando o arquivo atual do projeto.
2. Se ainda subir a versão antiga, revisar bloqueios de deploy da função (bundle/cache/lock) e repetir o deploy limpo.
3. Validar logo após o deploy pelos logs:
   - o erro de `request_three_d_secure` precisa desaparecer;
   - precisa aparecer `Checkout session created`.
4. Testar novamente o clique em “Contratar” no fluxo real para confirmar o redirecionamento ao checkout.

Detalhes técnicos

- Arquivo afetado: `supabase/functions/create-checkout/index.ts`
- Estado atual do código: correto (`'any'`)
- Estado atual do backend em execução: ainda incompatível com Stripe
- Correção necessária agora: alinhar deploy da função com o código já corrigido
