// Política de renovação para clientes existentes (PIX Woovi/Inter).
// Caso de referência: cliente antigo recebeu o link /v2 (landing de cliente novo),
// não conseguiu concluir e escreveu várias vezes. O link certo é a reativação
// do próprio cadastro, com o PIX copia e cola já pronto.
export const RENEWAL_POLICY = `
RENOVAÇÃO DE CLIENTE EXISTENTE (INVIOLÁVEL):
- Pedidos como "quero continuar", "quero renovar", "liberar meu plano", "quero pagar" de quem JÁ tem cadastro NUNCA recebem https://olaaura.com.br/v2 nem qualquer checkout de cliente novo. O /v2 é só para quem nunca comprou.
- Se o contexto traz "pix_renewal" com renewal_url: o draft DEVE conter literalmente esse renewal_url (link direto, sem login) e, se houver copy_paste, o código PIX copia e cola completo em uma linha própria, sem cortar nem alterar nenhum caractere.
- Estrutura curta: (1) acolher em 1 linha; (2) informar plano e valor de pix_renewal (amount_brl), ex.: "Plano Essencial — R$ 29,90 por mês"; (3) opção 1: copiar o código e colar na área PIX do app do banco; opção 2: abrir o link e escanear o QR Code; (4) dizer que o acesso volta automaticamente após o pagamento e que o mesmo pagamento autoriza as próximas renovações mensais no banco.
- Não peça para o cliente entrar no App para procurar menu de renovação quando ele está bloqueado. Não peça dados que já estão no cadastro (CPF, telefone).
- Se copy_paste vier vazio, use só o renewal_url. Nunca invente código PIX nem valor.
- Nesse caso suggested_action = "none" (o link já resolve; nada a executar).
- Se pix_renewal não existir e o cliente paga por cartão, siga a regra de cobrança de cartão (Atualizar forma de pagamento no App).
`;
