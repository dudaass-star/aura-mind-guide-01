import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendTextMessage, cleanPhoneNumber } from "../_shared/zapi-client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PLAN_LABELS: Record<string, string> = {
  essencial: 'Essencial',
  direcao: 'Direção',
  transformacao: 'Transformação',
};

function isQuietHoursBRT(): boolean {
  const now = new Date();
  const brtHour = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })).getHours();
  return brtHour >= 22 || brtHour < 8;
}

function buildRecoveryMessage(name: string, plan: string): string {
  const planLabel = PLAN_LABELS[plan] || plan;
  const checkoutLink = `https://olaaura.com.br/checkout?plan=${plan}`;

  return `Oi, ${name}! 💜

Você estava a um passo de começar sua jornada com a Aura — uma companhia que te escuta de verdade, todos os dias, sem julgamento.

Seu plano ${planLabel} ainda tá reservado. Pra finalizar, é só clicar aqui:
${checkoutLink}

Às vezes a gente só precisa de um empurrãozinho pra começar a cuidar de si. Esse pode ser o seu. 🤍`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('🛒 [RECOVERY] Starting abandoned checkout recovery...');

    // Respect quiet hours (22h-08h BRT)
    if (isQuietHoursBRT()) {
      console.log('🌙 [RECOVERY] Quiet hours (22h-08h BRT), skipping.');
      return new Response(JSON.stringify({ status: 'quiet_hours', sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find abandoned checkouts: created > 30 min ago, not completed, not yet recovered
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    const { data: abandoned, error } = await supabase
      .from('checkout_sessions')
      .select('id, phone, name, plan, email, stripe_session_id')
      .eq('status', 'created')
      .eq('recovery_sent', false)
      .lt('created_at', thirtyMinAgo)
      .limit(50);

    if (error) {
      console.error('❌ [RECOVERY] Query error:', error);
      throw error;
    }

    if (!abandoned || abandoned.length === 0) {
      console.log('✅ [RECOVERY] No abandoned checkouts to recover.');
      return new Response(JSON.stringify({ status: 'no_abandoned', sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`📋 [RECOVERY] Found ${abandoned.length} abandoned checkouts.`);

    let sent = 0;
    let failed = 0;

    for (const session of abandoned) {
      try {
        if (!session.phone) {
          console.warn(`⚠️ [RECOVERY] No phone for session ${session.id}, skipping.`);
          continue;
        }

        const name = session.name || 'você';
        const plan = session.plan || 'essencial';
        const message = buildRecoveryMessage(name, plan);
        const cleanPhone = cleanPhoneNumber(session.phone);

        console.log(`📤 [RECOVERY] Sending to ${cleanPhone.substring(0, 4)}*** for plan ${plan}`);

        const result = await sendTextMessage(cleanPhone, message);

        if (result.success) {
          // Mark as recovery sent
          await supabase
            .from('checkout_sessions')
            .update({ recovery_sent: true })
            .eq('id', session.id);

          sent++;
          console.log(`✅ [RECOVERY] Sent to ${cleanPhone.substring(0, 4)}***`);
        } else {
          console.error(`❌ [RECOVERY] Failed to send to ${cleanPhone.substring(0, 4)}***:`, result.error);
          failed++;
        }
      } catch (err) {
        console.error(`❌ [RECOVERY] Error processing session ${session.id}:`, err);
        failed++;
      }

      // Anti-burst delay
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log(`✅ [RECOVERY] Done: ${sent} sent, ${failed} failed out of ${abandoned.length}`);

    return new Response(JSON.stringify({ status: 'completed', sent, failed, total: abandoned.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ [RECOVERY] Fatal error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
