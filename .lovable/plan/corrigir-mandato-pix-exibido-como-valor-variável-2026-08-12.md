# Corrigir mandato PIX exibido como valor variável

## Diagnóstico confirmado

- O QR testado já usa o novo modo `composed`: cobrança imediata de **R$ 6,90** + mandato separado de **R$ 29,90**.
- O registro criado pela Woovi confirma `journey: ONLY_RECURRENCY` e `value: 2990`, portanto a composição das tags `/cob/` e `/rec/` foi aplicada.
- Porém, o payload do mandato também envia `pixRecurringOptions.minimumValue: 2990`. Esse campo caracteriza uma autorização com valor variável/limite, por isso o banco mostra **“Valor variável”** e **“Valor máximo: Não definido”**.
- O compositor EMV apenas reúne a cobrança e a autorização em um scan; ele não altera as condições do mandato já registrado pela Woovi.

## Ajuste

1. **Criar o mandato como valor fixo**
   - Manter `value: 2990`, frequência mensal e `journey: ONLY_RECURRENCY`.
   - Remover `minimumValue` do mandato composto; não substituir por outro limite variável.
   - Aplicar a mesma higiene no caminho nativo sem promoção, para ele também não gerar autorização variável.

2. **Validar a resposta antes de entregar o QR**
   - Confirmar que a assinatura retornada preserva o preço recorrente esperado.
   - Se a Woovi devolver configuração incompatível com valor fixo, interromper a criação e cancelar a cobrança de entrada, evitando um QR enganoso ou cobrança órfã.
   - Registrar diagnóstico suficiente no backend sem expor dados pessoais.

3. **Cobrir com testes**
   - Testar o payload da assinatura composta: `value` cheio presente e nenhum campo de faixa variável.
   - Testar composição do BR Code, CRC e presença simultânea de `/cob/` e `/rec/`.
   - Testar rollback da cobrança de R$ 6,90 quando a criação/validação do mandato falhar.

4. **Teste financeiro controlado**
   - Implantar as funções atualizadas.
   - Cancelar/inutilizar os mandatos pendentes de teste anteriores para não deixar autorizações concorrentes.
   - Gerar um QR totalmente novo para Eduardo Santos; QR antigo não muda porque o mandato já foi registrado como variável.
   - Antes do pagamento, conferir no Nubank que a revisão mostra **R$ 6,90 agora + R$ 29,90 mensal fixo**, sem “valor variável” e sem “valor máximo não definido”.
   - Só então concluir o pagamento e validar webhook, ativação e próxima cobrança.

## Critério de aceite

Um único scan apresenta a cobrança inicial de **R$ 6,90** e uma autorização mensal **fixa de R$ 29,90**, sem permitir edição de limite máximo e sem criar cobrança/mandato órfão em caso de falha.
