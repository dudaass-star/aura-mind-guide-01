import PostalMime from "npm:postal-mime@2.4.3";

Deno.test("Preserva texto UTF-8, identidade e encadeamento do e-mail", async () => {
  const raw = "From: Cliente <cliente@example.org>\r\nTo: suporte@example.org\r\nMessage-ID: <teste-1@example.org>\r\nIn-Reply-To: <anterior@example.org>\r\nReferences: <anterior@example.org>\r\nSubject: Cancelamento\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nOlá, preciso cancelar minha assinatura.";
  const mail = await PostalMime.parse(new TextEncoder().encode(raw));
  if (mail.from?.address !== "cliente@example.org" || mail.messageId !== "<teste-1@example.org>" || mail.inReplyTo !== "<anterior@example.org>" || !mail.text?.includes("Olá, preciso cancelar")) throw new Error("Dados de entrada não preservados");
});

Deno.test("Preserva anexos sem confundir o texto da solicitação", async () => {
  const raw = "From: cliente@example.org\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=teste\r\n\r\n--teste\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nComprovante em anexo\r\n--teste\r\nContent-Type: text/plain\r\nContent-Disposition: attachment; filename=prova.txt\r\nContent-Transfer-Encoding: base64\r\n\r\ncHJvdmE=\r\n--teste--";
  const mail = await PostalMime.parse(new TextEncoder().encode(raw));
  const attachment = mail.attachments[0];
  if (!attachment) throw new Error("Anexo ausente");
  const content = typeof attachment.content === "string" ? attachment.content : new TextDecoder().decode(attachment.content);
  if (!mail.text?.includes("Comprovante") || attachment.filename !== "prova.txt" || content !== "prova") throw new Error("Anexo não preservado");
});