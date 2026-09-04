# Código do encontro de R$ 6,90 entregue como botão de copiar

Hoje o código PIX vai escrito dentro da mensagem, e o cliente tem que selecionar tudo à mão — é aí que ele copia pedaço errado e o pagamento falha.

O WhatsApp não permite botão de copiar em mensagem escrita na hora (o botão de copiar código da Meta aceita no máximo 15 caracteres, e o PIX tem mais de 100). Então a mensagem passa a levar **um link curto nosso** que abre uma página com a cara da Aura: valor, QR Code e um botão grande **"Copiar código PIX"**.

## Como fica pro lead

```text
aceita o encontro de R$ 6,90
   ↓
mensagem curta: "seu encontro está reservado · abre aqui pra pagar" + link olaaura.com.br/...
   ↓
página da Aura: R$ 6,90 · QR Code · botão "Copiar código PIX" (vira "Código copiado")
   ↓
paga → a página avisa "pagamento confirmado" e a Aura chama no WhatsApp oficial
```

A mensagem passa a levar **só o link** (sem o código escrito), como você escolheu.

## A página

- Identidade visual da Aura (mesmo tema escuro do checkout).
- Título claro: encontro guiado de 45 minutos, R$ 6,90, PIX comum, sem autorizar cobrança automática.
- QR Code pra quem paga pelo celular em outro aparelho.
- Botão grande de copiar com retorno visível ("Código copiado") e instrução em uma linha: abrir o app do banco, escolher PIX copia e cola, colar.
- Aviso de validade e, se o código já tiver sido pago, mensagem de confirmação em vez do botão.
- Sem menção a plano, sem preço de mensalidade, sem upsell.

## Detalhes técnicos

- **Rota nova** `/pix/:token` (`src/pages/PixTaster.tsx`), registrada em `src/App.tsx`. Página pública, sem login.
- **Token público** gerado junto da cobrança em `supabase/functions/_shared/taster.ts` e guardado na linha de `taster_offers` (migração: coluna `public_token` única + índice). Token aleatório, sem expor telefone nem id interno.
- **Edge function nova** `pix-taster-info` (`verify_jwt = false`): recebe o token, devolve valor, código copia-e-cola, imagem/QR e status de pagamento. Nenhum dado pessoal na resposta. Nada de leitura direta da tabela pelo navegador — RLS de `taster_offers` continua fechada.
- **Link curto**: gerado via `create-short-link` (domínio `olaaura.com.br` já está na allowlist) apontando pra `/pix/<token>`; se a geração falhar, cai no link completo.
- **Mensagem**: em `supabase/functions/recovery-agent/pix-buttons.ts`, `handleTasterAccept` para de colar o código no corpo e passa a mandar o link. `metadata` continua guardando `pix_code` e `correlation_id` pro histórico do admin.
- **Reaproveitamento**: quando a cobrança já existe (idempotência por `correlationID`), reusa o token já gravado — clique repetido devolve o mesmo link.
- **Status na página**: consulta o status já gravado pelo `webhook-woovi`, com recarga leve a cada poucos segundos enquanto estiver aberta.
- Nenhuma mudança em gateway, valores, elegibilidade, travas do taster, régua de recuperação ou templates aprovados.

## Validação

- Gerar um código de teste com o telefone de teste já configurado, abrir o link no celular e no desktop, copiar e colar no app do banco.
- Conferir que o código copiado é idêntico ao gravado na cobrança (sem espaço nem quebra de linha).
- Conferir que a página mostra "pago" depois da confirmação e que o link expirado não expõe nada.
