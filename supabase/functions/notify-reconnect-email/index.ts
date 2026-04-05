import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendLovableEmail } from "npm:@lovable.dev/email-js";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SENDER_DOMAIN = 'notify.olaaura.com.br';
const FROM_EMAIL = 'noreply@olaaura.com.br';
const WHATSAPP_LINK = 'https://wa.me/554888735220';

function buildEmailHTML(name: string | null): string {
  const nome = name?.split(' ')[0] || 'Ei';

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#fafaf8;font-family:'Nunito',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fafaf8;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:520px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, hsl(155,30%,45%), hsl(155,25%,55%));padding:32px 30px;text-align:center;">
              <h1 style="margin:0;font-size:24px;color:#ffffff;font-family:'Fraunces',Georgia,serif;font-weight:600;">
                🌿 Aura
              </h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 30px;">
              <h2 style="margin:0 0 16px;font-size:20px;color:#2d3748;font-family:'Fraunces',Georgia,serif;font-weight:600;">
                Oi, ${nome}! 💜
              </h2>
              <p style="margin:0 0 16px;font-size:15px;color:#4a5568;line-height:1.6;">
                A Aura mudou de número no WhatsApp! Para continuarmos de onde paramos, é só me mandar um <strong>"Oi"</strong> no novo número.
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#4a5568;line-height:1.6;">
                Clique no botão abaixo para abrir a conversa diretamente:
              </p>
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td align="center">
                    <a href="${WHATSAPP_LINK}" target="_blank" style="display:inline-block;background:linear-gradient(135deg, hsl(155,30%,45%), hsl(155,25%,55%));color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:16px;font-weight:600;font-family:'Nunito',Arial,sans-serif;">
                      💬 Falar com a Aura no WhatsApp
                    </a>
                  </td>
                </tr>
              </table>
              <!-- Reassurance box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
                <tr>
                  <td style="background-color:#f0f7f4;border-radius:12px;padding:20px;border-left:4px solid hsl(155,30%,45%);">
                    <p style="margin:0;font-size:14px;color:#2d6a4f;line-height:1.5;">
                      🔒 <strong>Suas conversas e insights estão seguros.</strong> Nada foi perdido — é só me chamar no novo número e continuamos de onde paramos.
                    </p>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:15px;color:#4a5568;">
                Te espero lá! 💚<br/>
                <strong style="color:hsl(155,30%,45%);">Aura</strong> 🌿
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 30px;background-color:#f7f7f5;text-align:center;border-top:1px solid #e8e8e4;">
              <p style="margin:0;font-size:12px;color:#a0a0a0;">
                Você recebeu este email porque é assinante da Aura.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildPlainText(name: string | null): string {
  const nome = name?.split(' ')[0] || 'Ei';
  return `Oi, ${nome}! A Aura mudou de número no WhatsApp! Para continuarmos de onde paramos, é só me mandar um "Oi" no novo número. Clique aqui para abrir a conversa: ${WHATSAPP_LINK} — Suas conversas e insights estão seguros. Nada foi perdido. Te espero lá! Aura`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const apiKey = Deno.env.get('LOVABLE_API_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch active users who haven't messaged the new number yet
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('name, email, phone, last_user_message_at')
      .in('status', ['active', 'trial'])
      .not('email', 'is', null)
      .is('last_user_message_at', null)
      .neq('phone', 'test-admin');

    if (profilesError) throw profilesError;

    // Deduplicate by email
    const seen = new Set<string>();
    const uniqueProfiles: { name: string | null; email: string }[] = [];
    for (const p of profiles || []) {
      const key = (p.email as string).toLowerCase().trim();
      if (!seen.has(key)) {
        seen.add(key);
        uniqueProfiles.push({ name: p.name, email: key });
      }
    }

    console.log(`📧 Sending reconnect email to ${uniqueProfiles.length} users`);

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const profile of uniqueProfiles) {
      try {
        const unsubToken = crypto.randomUUID();
        await sendLovableEmail(
          {
            to: profile.email,
            from: `Aura <${FROM_EMAIL}>`,
            sender_domain: SENDER_DOMAIN,
            subject: 'A Aura mudou de número! Me chama no novo WhatsApp 💜',
            html: buildEmailHTML(profile.name),
            text: buildPlainText(profile.name),
            purpose: 'transactional',
            idempotency_key: `reconnect-${profile.email}-2026-04-05`,
            unsubscribe_token: unsubToken,
          },
          { apiKey, sendUrl: Deno.env.get('LOVABLE_SEND_URL') }
        );

        sent++;
        console.log(`✅ Sent to ${profile.email}`);
        await new Promise(r => setTimeout(r, 200));
      } catch (e) {
        failed++;
        const errMsg = e instanceof Error ? e.message : 'unknown';
        errors.push(`${profile.email}: ${errMsg}`);
        console.error(`❌ Failed ${profile.email}: ${errMsg}`);
      }
    }

    console.log(`📊 Done: ${sent} sent, ${failed} failed`);

    return new Response(JSON.stringify({
      sent,
      failed,
      total: uniqueProfiles.length,
      errors: errors.slice(0, 10),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('❌ Reconnect email error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
