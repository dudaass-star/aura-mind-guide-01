import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function buildEmailHTML(name: string | null): string {
  const greeting = name ? `Olá, ${name}!` : 'Olá!';
  
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
                ${greeting}
              </h2>
              <p style="margin:0 0 16px;font-size:15px;color:#4a5568;line-height:1.6;">
                Estamos passando por uma <strong>manutenção programada</strong> para melhorar sua experiência com a Aura. Durante esse período, nossas conversas pelo WhatsApp estão temporariamente pausadas.
              </p>
              <p style="margin:0 0 16px;font-size:15px;color:#4a5568;line-height:1.6;">
                A previsão é que <strong>tudo volte ao normal ainda hoje</strong>. Assim que estivermos de volta, você será a primeira pessoa a saber! 💚
              </p>
              <!-- Reassurance box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
                <tr>
                  <td style="background-color:#f0f7f4;border-radius:12px;padding:20px;border-left:4px solid hsl(155,30%,45%);">
                    <p style="margin:0;font-size:14px;color:#2d6a4f;line-height:1.5;">
                      🔒 <strong>Fique tranquilo(a):</strong> todas as suas conversas, insights e dados estão completamente seguros. Nada será perdido.
                    </p>
                  </td>
                </tr>
              </table>
              <p style="margin:20px 0 0;font-size:15px;color:#4a5568;line-height:1.6;">
                Agradecemos pela paciência e compreensão. Estamos trabalhando para que a Aura volte ainda melhor!
              </p>
              <p style="margin:24px 0 0;font-size:15px;color:#4a5568;">
                Com carinho,<br/>
                <strong style="color:hsl(155,30%,45%);">Equipe Aura</strong> 🌿
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 30px;background-color:#f7f7f5;text-align:center;border-top:1px solid #e8e8e4;">
              <p style="margin:0;font-size:12px;color:#a0a0a0;">
                Você recebeu este email porque é usuário(a) da Aura.
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch active/trial users with email
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('name, email')
      .in('status', ['active', 'trial'])
      .not('email', 'is', null);

    if (profilesError) throw profilesError;

    // Deduplicate by lowercase email
    const seen = new Set<string>();
    const uniqueProfiles: { name: string | null; email: string }[] = [];
    for (const p of profiles || []) {
      const key = (p.email as string).toLowerCase().trim();
      if (!seen.has(key)) {
        seen.add(key);
        uniqueProfiles.push({ name: p.name, email: key });
      }
    }

    console.log(`📧 Sending maintenance email to ${uniqueProfiles.length} unique users`);

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const profile of uniqueProfiles) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify({
            from: 'Aura <onboarding@resend.dev>',
            to: [profile.email],
            subject: 'Aura em manutenção — voltamos em breve 💚',
            html: buildEmailHTML(profile.name),
          }),
        });

        if (res.ok) {
          sent++;
          console.log(`✅ Sent to ${profile.email}`);
        } else {
          const errBody = await res.text();
          failed++;
          errors.push(`${profile.email}: ${errBody}`);
          console.error(`❌ Failed ${profile.email}: ${errBody}`);
        }

        // Small delay to avoid rate limits
        await new Promise(r => setTimeout(r, 200));
      } catch (e) {
        failed++;
        errors.push(`${profile.email}: ${e instanceof Error ? e.message : 'unknown'}`);
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
    console.error('❌ Notify error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
