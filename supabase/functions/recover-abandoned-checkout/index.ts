import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeBrazilianPhone, getPhoneVariations } from "../_shared/zapi-client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PLAN_LABELS: Record<string, string> = {
  essencial: 'Essencial',
  direcao: 'Direção',
  transformacao: 'Transformação',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('🛒 [RECOVERY] Starting abandoned checkout recovery (email)...');

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

    // Deduplicate by email (primary) and phone (secondary)
    const byKey = new Map<string, typeof abandoned[number]>();
    const duplicates: typeof abandoned = [];

    for (const s of abandoned) {
      const dedupeKey = s.email || s.phone || `__no_key_${s.id}`;
      const existing = byKey.get(dedupeKey);
      if (!existing) {
        byKey.set(dedupeKey, s);
      } else {
        duplicates.push(existing.id > s.id ? s : existing);
        byKey.set(dedupeKey, existing.id > s.id ? existing : s);
      }
    }

    // Mark duplicates as sent without actually sending
    if (duplicates.length > 0) {
      console.log(`🔄 [RECOVERY] Marking ${duplicates.length} duplicate sessions as skipped.`);
      for (const dup of duplicates) {
        await supabase.from('checkout_sessions').update({
          recovery_sent: true,
          recovery_last_error: 'Duplicate - grouped by email/phone',
          recovery_attempts_count: 1,
        }).eq('id', dup.id);

        await supabase.from('checkout_recovery_attempts').insert({
          checkout_session_id: dup.id,
          phone_raw: dup.phone,
          phone_normalized: null,
          status: 'skipped_duplicate',
          error_message: 'Duplicate session for same email/phone',
        });
      }
    }

    const uniqueSessions = Array.from(byKey.values());
    console.log(`📋 [RECOVERY] Processing ${uniqueSessions.length} unique sessions (${duplicates.length} duplicates skipped).`);

    // Pre-fetch active/trial profiles to skip existing customers
    const { data: activeProfiles } = await supabase
      .from('profiles')
      .select('phone, email')
      .in('status', ['active', 'trial'])
      .not('phone', 'is', null);

    const activePhoneSet = new Set<string>();
    const activeEmailSet = new Set<string>();
    if (activeProfiles) {
      for (const p of activeProfiles) {
        if (p.phone) {
          const variations = getPhoneVariations(p.phone);
          for (const v of variations) activePhoneSet.add(v);
        }
        if (p.email) activeEmailSet.add(p.email.toLowerCase());
      }
    }

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const session of uniqueSessions) {
      try {
        // Must have email for email-based recovery
        if (!session.email) {
          console.warn(`⚠️ [RECOVERY] No email for session ${session.id}, skipping.`);

          await supabase.from('checkout_recovery_attempts').insert({
            checkout_session_id: session.id,
            phone_raw: session.phone || null,
            phone_normalized: null,
            status: 'skipped',
            error_message: 'No email address',
          });

          await supabase.from('checkout_sessions').update({
            recovery_sent: true,
            recovery_last_error: 'No email address',
            recovery_attempts_count: 1,
          }).eq('id', session.id);

          skipped++;
          continue;
        }

        // Check if this email belongs to an active customer
        if (activeEmailSet.has(session.email.toLowerCase())) {
          console.log(`⏭️ [RECOVERY] Email ${session.email.substring(0, 3)}*** is active customer, skipping.`);

          await supabase.from('checkout_recovery_attempts').insert({
            checkout_session_id: session.id,
            phone_raw: session.phone || null,
            phone_normalized: session.phone ? normalizeBrazilianPhone(session.phone) : null,
            status: 'skipped_active_customer',
            error_message: 'Email belongs to active/trial customer',
          });

          await supabase.from('checkout_sessions').update({
            recovery_sent: true,
            recovery_last_error: 'Active customer - skipped',
            recovery_attempts_count: 1,
          }).eq('id', session.id);

          skipped++;
          continue;
        }

        // Also check phone if available
        if (session.phone) {
          const phoneVariations = getPhoneVariations(session.phone);
          const isActiveByPhone = phoneVariations.some(v => activePhoneSet.has(v));
          if (isActiveByPhone) {
            console.log(`⏭️ [RECOVERY] Phone is active customer, skipping.`);

            await supabase.from('checkout_recovery_attempts').insert({
              checkout_session_id: session.id,
              phone_raw: session.phone,
              phone_normalized: normalizeBrazilianPhone(session.phone),
              status: 'skipped_active_customer',
              error_message: 'Phone belongs to active/trial customer',
            });

            await supabase.from('checkout_sessions').update({
              recovery_sent: true,
              recovery_last_error: 'Active customer (phone) - skipped',
              recovery_attempts_count: 1,
            }).eq('id', session.id);

            skipped++;
            continue;
          }
        }

        const customerName = session.name || 'você';
        const plan = session.plan || 'essencial';
        const checkoutLink = `https://olaaura.com.br/checkout?plan=${plan}`;

        console.log(`📤 [RECOVERY] Sending email to ${session.email.substring(0, 3)}*** for plan ${plan}`);

        // Send recovery email via supabase.functions.invoke (handles auth properly)
        const { data: emailData, error: emailError } = await supabase.functions.invoke('send-transactional-email', {
          body: {
            templateName: 'checkout-recovery',
            recipientEmail: session.email,
            idempotencyKey: `checkout-recovery-${session.id}`,
            templateData: { name: customerName, plan, checkoutLink },
          },
        });

        const emailOk = !emailError;
        const emailBody = emailError ? JSON.stringify(emailError) : JSON.stringify(emailData);

        // Log the attempt
        await supabase.from('checkout_recovery_attempts').insert({
          checkout_session_id: session.id,
          phone_raw: session.phone || null,
          phone_normalized: session.phone ? normalizeBrazilianPhone(session.phone) : null,
          status: emailOk ? 'api_accepted' : 'failed',
          error_message: emailOk ? null : emailBody,
        });

        if (emailOk) {
          await supabase.from('checkout_sessions').update({
            recovery_sent: true,
            recovery_sent_at: new Date().toISOString(),
            recovery_last_error: null,
            recovery_attempts_count: 1,
          }).eq('id', session.id);

          sent++;
          console.log(`✅ [RECOVERY] Email sent to ${session.email.substring(0, 3)}***`);
        } else {
          await supabase.from('checkout_sessions').update({
            recovery_sent: true,
            recovery_last_error: emailBody || 'Unknown error',
            recovery_attempts_count: 1,
          }).eq('id', session.id);

          console.error(`❌ [RECOVERY] Failed to send email:`, emailBody);
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

    console.log(`✅ [RECOVERY] Done: ${sent} sent, ${failed} failed, ${skipped} skipped out of ${uniqueSessions.length} unique (${duplicates.length} duplicates auto-skipped)`);

    return new Response(JSON.stringify({ status: 'completed', sent, failed, skipped, duplicates_skipped: duplicates.length, total: abandoned.length }), {
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
