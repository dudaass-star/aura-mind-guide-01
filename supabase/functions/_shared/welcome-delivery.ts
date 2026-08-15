// Entrega do welcome de WhatsApp com observabilidade.
// Antes cada webhook de pagamento fazia console.log quando o envio falhava —
// resultado: cliente pagava, ganhava acesso e nunca recebia mensagem, sem
// nenhum rastro para investigar. Aqui centralizamos: retry, registro do
// sucesso em profiles.welcome_sent_at e registro da falha em failed_message_log
// (que é o que a rede de segurança e o admin leem).
import { sendProactive } from "./whatsapp-provider.ts";

// deno-lint-ignore no-explicit-any
type Supa = any;

export async function logWhatsappFailure(
  supabase: Supa,
  args: { functionName: string; userId?: string | null; phone?: string | null; content: string; error?: string | null },
): Promise<void> {
  try {
    await supabase.from("failed_message_log").insert({
      function_name: args.functionName,
      user_id: args.userId ?? null,
      phone: args.phone ?? null,
      content: args.content.slice(0, 2000),
      error: (args.error || "erro desconhecido").slice(0, 1000),
    });
  } catch (e) {
    console.warn("[welcome-delivery] não consegui registrar falha:", (e as Error)?.message);
  }
}

/**
 * Dispara o template de welcome (2 tentativas) e devolve se saiu.
 * Sucesso → grava profiles.welcome_sent_at. Falha → failed_message_log.
 */
export async function sendWelcomeWhatsApp(
  supabase: Supa,
  args: { phone: string; name: string; userId: string; functionName: string; templateCategory?: string },
): Promise<boolean> {
  const templateText = `Olá, ${args.name}. Sua assinatura da Aura foi ativada com sucesso.`;
  const category = args.templateCategory || "welcome";
  let error: string | null = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await sendProactive(args.phone, templateText, category, args.userId);
      if (res?.success) {
        console.log(`[${args.functionName}] ✅ welcome enviado via ${res.provider} (tentativa ${attempt})`);
        try {
          await supabase.from("profiles")
            .update({ welcome_sent_at: new Date().toISOString() })
            .eq("user_id", args.userId);
        } catch { /* non-blocking */ }
        return true;
      }
      error = res?.error || `provider=${res?.provider ?? "?"} sem sucesso`;
    } catch (e) {
      error = (e as Error)?.message || "exceção no envio";
    }
    if (attempt === 1) await new Promise((r) => setTimeout(r, 3000));
  }

  console.error(`[${args.functionName}] ❌ welcome falhou: ${error}`);
  await logWhatsappFailure(supabase, {
    functionName: args.functionName,
    userId: args.userId,
    phone: args.phone,
    content: `[WELCOME_TEMPLATE] ${templateText}`,
    error,
  });
  return false;
}
