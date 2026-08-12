# Fazer o PIX voltar a aparecer no checkout

## O que está acontecendo (confirmado agora)

Duas travas somadas, e o site esconde o PIX por causa das duas:

1. **O checkout não consegue nem ler a configuração do PIX.** A regra de acesso da tabela de configuração libera para visitante anônimo **apenas** a chave `card_gateway`. As chaves `pix_gateway` e `pix_rail_status` estão bloqueadas — a resposta que o site recebe hoje traz só `card_gateway`. Sem conseguir ler a saúde do trilho, o código assume "trilho fora do ar" e esconde o PIX (é isso que gera o evento `pix_rail_down` no funil a cada carregamento).

2. **A configuração ainda aponta para o trilho errado.** No banco: `pix_gateway = asaas` e `pix_rail_status = { healthy: false, httpStatus: 401 }` — a Asaas segue com credencial recusada. Ou seja, mesmo destravando a leitura, o PIX continuaria escondido, porque o trilho ativo é justamente o que não funciona. O trilho que está funcionando é a **Woovi**.

## Correção

**Passo 1 — liberar a leitura pública das duas chaves**
Migração ajustando a política de leitura anônima da tabela de configuração para incluir `pix_gateway` e `pix_rail_status` além de `card_gateway`. São dados não sensíveis (qual gateway atende e se está no ar); nenhuma credencial é exposta.

**Passo 2 — promover a Woovi como trilho ativo e gravar a saúde real**
- Rodar a sonda de saúde da Woovi para gravar `pix_rail_status` com `gateway: woovi` e `healthy: true`.
- Definir `pix_gateway = woovi`.
- Se a sonda falhar, não promovo nada: reporto o erro exato da Woovi e o PIX segue escondido de propósito — melhor esconder do que oferecer um PIX que quebra na hora de pagar.

**Passo 3 — validar no site**
Abrir `/v2/checkout` e conferir: opção PIX visível, PIX selecionável nas abas de ciclo, geração do QR composto (entrada + mandato) funcionando, e nenhum evento novo de `pix_rail_down` no funil.

**Passo 4 — coerência do estado de saúde**
Garantir que o `pix_rail_status` gravado sempre carregue o gateway a que se refere, para o site nunca confundir "Asaas com 401" com "trilho atual fora do ar" quando o trilho ativo for outro.

## Detalhes técnicos

- Migração: remover a policy `Anon can read card_gateway only` e criar uma nova `FOR SELECT TO anon USING (key IN ('card_gateway','pix_gateway','pix_rail_status'))`.
- Atualização do valor de `pix_gateway` via ferramenta de dados (não migração).
- Sonda: `asaas-health-check` com `probe_gateway: "woovi"` (já implementado), que é quem grava `pix_rail_status`.
- `src/pages/CheckoutV2.tsx`: sem mudança de lógica prevista — já lê e reage corretamente às duas chaves (linhas 285-318 e 370-382). Só mexo se o Passo 4 exigir comparar o gateway do status com o trilho ativo.