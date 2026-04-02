import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeBrazilianPhone, getPhoneVariations } from "../_shared/zapi-client.ts";
import { sendProactive } from "../_shared/whatsapp-provider.ts";

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
      .eq('recovery_attempts_count', 0)
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

    // Pre-fetch active/trial profiles to skip existing customers
    const { data: activeProfiles } = await supabase
      .from('profiles')
      .select('phone')
      .in('status', ['active', 'trial'])
      .not('phone', 'is', null);

    const activePhoneSet = new Set<string>();
    if (activeProfiles) {
      for (const p of activeProfiles) {
        if (p.phone) {
          const variations = getPhoneVariations(p.phone);
          for (const v of variations) activePhoneSet.add(v);
        }
      }
    }

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const session of abandoned) {
      try {
        if (!session.phone) {
          console.warn(`⚠️ [RECOVERY] No phone for session ${session.id}, skipping.`);

          // Log attempt with error
          await supabase.from('checkout_recovery_attempts').insert({
            checkout_session_id: session.id,
            phone_raw: null,
            phone_normalized: null,
            status: 'skipped',
            error_message: 'No phone number',
          });

          await supabase.from('checkout_sessions').update({
            recovery_sent: true,
            recovery_last_error: 'No phone number',
            recovery_attempts_count: 1,
          }).eq('id', session.id);

          skipped++;
          continue;
        }

        const normalizedPhone = normalizeBrazilianPhone(session.phone);

        // Check if this phone belongs to an active customer
        const phoneVariations = getPhoneVariations(session.phone);
        const isActiveCustomer = phoneVariations.some(v => activePhoneSet.has(v));

        if (isActiveCustomer) {
          console.log(`⏭️ [RECOVERY] Phone ${normalizedPhone.substring(0, 6)}*** is active customer, skipping.`);

          await supabase.from('checkout_recovery_attempts').insert({
            checkout_session_id: session.id,
            phone_raw: session.phone,
            phone_normalized: normalizedPhone,
            status: 'skipped_active_customer',
            error_message: 'Phone belongs to active/trial customer',
          });

          await supabase.from('checkout_sessions').update({
            recovery_sent: true,
            recovery_last_error: 'Active customer - skipped',
            recovery_attempts_count: 1,
          }).eq('id', session.id);

          skipped++;
          continue;
        }

        const name = session.name || 'você';
        const plan = session.plan || 'essencial';
        const message = buildRecoveryMessage(name, plan);
        const planLabel = PLAN_LABELS[plan] || plan;
        const checkoutLink = `https://olaaura.com.br/checkout?plan=${plan}`;

        console.log(`📤 [RECOVERY] Sending to ${normalizedPhone.substring(0, 6)}*** (raw: ${session.phone.substring(0, 4)}***) for plan ${plan}`);

        const result = await sendProactive(normalizedPhone, message, 'checkout_recovery', undefined, undefined, undefined, [name, planLabel, checkoutLink]);

        // Log the attempt with full details
        await supabase.from('checkout_recovery_attempts').insert({
          checkout_session_id: session.id,
          phone_raw: session.phone,
          phone_normalized: normalizedPhone,
          status: result.success ? 'api_accepted' : 'failed',
          provider_response: result.response ? JSON.parse(JSON.stringify(result.response)) : null,
          error_message: result.error || null,
        });

        if (result.success) {
          await supabase.from('checkout_sessions').update({
            recovery_sent: true,
            recovery_sent_at: new Date().toISOString(),
            recovery_last_error: null,
            recovery_attempts_count: 1,
          }).eq('id', session.id);

          sent++;
          console.log(`✅ [RECOVERY] Sent to ${normalizedPhone.substring(0, 6)}***`);
        } else {
          await supabase.from('checkout_sessions').update({
            recovery_sent: true,
            recovery_last_error: result.error || 'Unknown error',
            recovery_attempts_count: 1,
          }).eq('id', session.id);

          console.error(`❌ [RECOVERY] Failed to send to ${normalizedPhone.substring(0, 6)}***:`, result.error);
          failed++;
        }
      } catch (err) {
        console.error(`❌ [RECOVERY] Error processing session ${session.id}:`, err);

        await supabase.from('checkout_recovery_attempts').insert({
          checkout_session_id: session.id,
          phone_raw: session.phone || null,
          phone_normalized: null,
          status: 'error',
          error_message: err instanceof Error ? err.message : 'Unknown error',
        }).catch(() => {});

        await supabase.from('checkout_sessions').update({
          recovery_sent: true,
          recovery_last_error: err instanceof Error ? err.message : 'Unknown error',
          recovery_attempts_count: 1,
        }).eq('id', session.id).catch(() => {});

        failed++;
      }

      // Anti-burst delay
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log(`✅ [RECOVERY] Done: ${sent} sent, ${failed} failed, ${skipped} skipped out of ${abandoned.length}`);

    return new Response(JSON.stringify({ status: 'completed', sent, failed, skipped, total: abandoned.length }), {
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
