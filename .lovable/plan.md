# Correção do modal PIX: código copia-e-cola invisível + tamanho da janela

## O problema

1. **Código copia-e-cola invisível**: o campo usa a classe `ck-field`, que só recebe cor de texto quando está dentro do container `.checkout-dark` da página. O modal é renderizado em um portal, fora desse container — então o texto fica sem cor de tema (branco sobre branco). É exatamente a mesma causa do CPF invisível já corrigido: o CPF foi corrigido com cores explícitas, mas o campo copia-e-cola continuou usando `ck-field`.

2. **Tamanho/layout do modal**: o conteúdo da etapa do QR é muito alto para telas de celular (QR de 224px + campo + 4 passos + bloco de aviso longo + status de polling). No preview de 393px de largura o modal estoura a altura da tela sem rolagem própria, o que explica a dúvida sobre o layout estar correto.

## O que será feito

### 1. Texto do copia-e-cola visível
- Trocar `ck-field` no input do copia-e-cola por cores explícitas (mesmo padrão do campo CPF): fundo translúcido, borda clara, texto branco.
- Manter fonte mono e tamanho pequeno, com truncamento em uma linha.

### 2. Modal com altura controlada e rolagem
- Definir altura máxima (~90vh) no `DialogContent` com rolagem interna, para o botão de copiar e o status de autorização nunca ficarem inacessíveis.
- Reduzir o QR em telas pequenas (de 224px para ~180px no mobile, mantendo maior no desktop) e diminuir o padding do card branco do QR.
- Compactar o bloco "O passo que a maioria esquece": manter a mensagem essencial visível e transformar o parágrafo longo sobre a ordem das telas dos bancos em um detalhe expansível ("Como aparece no seu banco"), evitando parede de texto no celular.
- Ajustar espaçamentos verticais para mobile (`space-y-3` no mobile, `space-y-4` a partir de sm).

### 3. Verificação
- Rodar o checkout no navegador em 393x575 e em desktop, gerando o modal do QR, para confirmar: código legível, modal inteiro acessível com rolagem, botão de copiar visível.

## Detalhes técnicos

- Arquivo: `src/pages/CheckoutV2.tsx` (bloco do `Dialog` do PIX, etapa `pixData`).
- Nenhuma mudança em lógica de pagamento, gateway, webhooks ou preços — apenas apresentação.
- `inputCls` continua em uso nos campos da página (fora do portal), sem alteração.
