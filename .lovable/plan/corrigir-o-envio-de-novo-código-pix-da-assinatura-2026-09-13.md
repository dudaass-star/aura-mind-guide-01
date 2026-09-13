# Corrigir o envio de novo código PIX da assinatura

## Diagnóstico confirmado

O sistema já possui dois fluxos diferentes:

- **PIX da assinatura**: R$ 6,90 de entrada + autorização da mensalidade, gerado por `criar-pix-recorrente-woovi`.
- **Encontro avulso**: R$ 6,90 por uma sessão única, gerado por `criar-pix-taster`.

Eles não precisam ser misturados. O problema está no fluxo da assinatura:

1. A ação automática só reconhece poucas frases exatas, como “Tive um erro” e “Gerar novo código”. Mensagens naturais como “o código deu erro no banco” ou “não chegou o código” podem cair na conversa livre.
2. Mesmo quando reconhece o pedido, o sistema reutiliza o código anterior enquanto ele não expirou. Isso é inadequado quando o banco acabou de recusá-lo.
3. A orientação atual permite que o agente diga que vai gerar um código, mas não existe uma ação vinculada a essa promessa. A proteção posterior apenas remove parte da frase e pode desviar indevidamente para o encontro avulso.

## Correção

### 1. Entender corretamente o que aconteceu

Separar três intenções no texto do lead:

- **Código não chegou**: reenviar o código mais recente, se ele foi realmente gerado e ainda está válido.
- **Código recusado/inválido no banco**: gerar um código recorrente realmente novo; não reutilizar o código que falhou.
- **Pedido explícito de outro código**: gerar um novo quando o contexto mostrar que o anterior apresentou problema.

A detecção aceitará frases naturais e variações de escrita, não apenas os textos exatos dos botões.

### 2. Gerar novamente o PIX correto

Criar uma operação interna de recuperação no gerador da Woovi para:

- usar os dados já preenchidos no checkout e na tentativa anterior;
- continuar sendo **entrada do plano + autorização mensal**, nunca encontro avulso;
- bloquear a operação se o pagamento ou a autorização já tiverem sido concluídos;
- gerar uma cobrança e um mandato novos quando o código anterior foi recusado;
- manter idempotência para cliques e mensagens repetidas;
- somente depois da nova geração bem-sucedida, cancelar e marcar como substituída a tentativa anterior ainda pendente;
- nunca deixar dois mandatos pendentes aproveitáveis para o mesmo checkout.

Essa operação será restrita à chamada interna do agente de recuperação; não ficará disponível como comando público do checkout.

### 3. Enviar o código, não apenas prometer

Quando a intenção for confirmada, o processamento ocorrerá antes da resposta livre do agente:

```text
Lead informa erro
        ↓
Sistema confere pagamento/autorização
        ↓
Gera ou reenvia o código correto
        ↓
Envia o código no WhatsApp
        ↓
Grava qual código e qual tentativa foram enviados
```

O agente só dirá “gerei” ou “vou te mandar” quando o envio fizer parte da mesma execução. Se a geração falhar, responderá honestamente que não conseguiu naquele momento, sem fingir que o código está a caminho.

### 4. Preservar o encontro avulso

O encontro guiado de R$ 6,90 continuará sendo oferecido apenas quando a pessoa pedir pagamento único, disser que não quer autorização automática ou aceitar explicitamente essa oferta.

Erro técnico no código da assinatura **não** será convertido automaticamente em oferta de encontro avulso.

### 5. Validar antes de publicar

Adicionar testes cobrindo:

- “o código está dando erro no meu banco” → novo PIX recorrente;
- “não chegou o código” → reenvio do código válido já criado;
- “gera outro código” após erro → nova tentativa recorrente;
- mensagens repetidas → uma única nova tentativa;
- pagamento ou mandato já concluído → nenhuma nova cobrança;
- pedido de sessão única → permanece no Taster;
- falha da Woovi → nenhuma promessa falsa e nenhuma tentativa antiga cancelada;
- substituição bem-sucedida → tentativa anterior encerrada e nova rastreável.

Depois, executar um teste controlado sem pagamento real, conferir o histórico registrado e publicar apenas `recovery-agent` e `criar-pix-recorrente-woovi`.

## Resultado esperado

No caso da Priscila, “o código deu erro no banco” passaria diretamente para uma nova geração do PIX da assinatura, e o novo copia-e-cola seria enviado na mesma resposta. “Não chegou o código” reenviaria o código que já havia sido criado. Em nenhum desses caminhos ela seria desviada para a sessão avulsa.
