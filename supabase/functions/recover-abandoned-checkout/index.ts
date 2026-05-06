import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeBrazilianPhone, getPhoneVariations } from "../_shared/zapi-client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Sequência de recuperação: 3 estágios, cada um com tom/gatilho diferente.
// Estágio 1 (lembrete) → 1h após criação
// Estágio 2 (emocional) → 24h após estágio 1 (~25h após criação)
// Estágio 3 (garantia)  → 72h após estágio 2 (~97h após criação)
const STAGES = [
  { stage: 1, template: 'checkout-recovery-1', minAgeMinutes: 60,    requiresPrevAfter: null     as null | number },
  { stage: 2, template: 'checkout-recovery-2', minAgeMinutes: 60,    requiresPrevAfter: 24 * 60  },
  { stage: 3, template: 'checkout-recovery-3', minAgeMinutes: 60,    requiresPrevAfter: 72 * 60  },
] as const;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('🛒 [RECOVERY] Starting 3-stage abandoned checkout recovery...');

    // Pré-busca clientes ativos (uma vez por execução) para skip
    const { data: activeProfiles } = await supabase
      .from('profiles')
      .select('phone, email')
      .in('status', ['active', 'trial']);

    const activePhoneSet = new Set<string>();
    const activeEmailSet = new Set<string>();
    if (activeProfiles) {
      for (const p of activeProfiles) {
        if (p.phone) {
          for (const v of getPhoneVariations(p.phone)) activePhoneSet.add(v);
        }
        if (p.email) activeEmailSet.add(p.email.toLowerCase());
      }
    }

    const totals = { sent: 0, failed: 0, skipped: 0, by_stage: {} as Record<number, number> };

    for (const cfg of STAGES) {
      const result = await processStage(supabase, cfg, activeEmailSet, activePhoneSet);
      totals.sent += result.sent;
      totals.failed += result.failed;
      totals.skipped += result.skipped;
      totals.by_stage[cfg.stage] = result.sent;
    }

    console.log(`✅ [RECOVERY] Done — sent: ${totals.sent}, failed: ${totals.failed}, skipped: ${totals.skipped}, by_stage:`, totals.by_stage);

    return new Response(JSON.stringify({ status: 'completed', ...totals }), {
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

async function processStage(
  supabase: any,
  cfg: typeof STAGES[number],
  activeEmailSet: Set<string>,
  activePhoneSet: Set<string>,
) {
  const now = Date.now();
  const createdBefore = new Date(now - cfg.minAgeMinutes * 60 * 1000).toISOString();

  // Para estágios 2 e 3, exige que o estágio anterior tenha sido enviado há X minutos
  let prevSentBefore: string | null = null;
  if (cfg.requiresPrevAfter !== null) {
    prevSentBefore = new Date(now - cfg.requiresPrevAfter * 60 * 1000).toISOString();
  }

  let query = supabase
    .from('checkout_sessions')
    .select('id, phone, name, plan, email, recovery_stage1_sent_at, recovery_stage2_sent_at')
    .eq('status', 'created')
    .eq('recovery_stage', cfg.stage - 1)
    .lt('created_at', createdBefore)
    .limit(50);

  if (cfg.stage === 2 && prevSentBefore) {
    query = query.lt('recovery_stage1_sent_at', prevSentBefore);
  } else if (cfg.stage === 3 && prevSentBefore) {
    query = query.lt('recovery_stage2_sent_at', prevSentBefore);
  }

  const { data: rows, error } = await query;
  if (error) {
    console.error(`❌ [RECOVERY stage ${cfg.stage}] Query error:`, error);
    return { sent: 0, failed: 0, skipped: 0 };
  }
  if (!rows || rows.length === 0) {
    return { sent: 0, failed: 0, skipped: 0 };
  }

  console.log(`📋 [RECOVERY stage ${cfg.stage}] Found ${rows.length} candidates.`);

  // Dedup por email
  const byKey = new Map<string, typeof rows[number]>();
  for (const s of rows) {
    const k = s.email || s.phone || `__${s.id}`;
    const existing = byKey.get(k);
    if (!existing) byKey.set(k, s);
  }

  let sent = 0, failed = 0, skipped = 0;

  for (const session of byKey.values()) {
    try {
      if (!session.email) {
        await markStageSkipped(supabase, session.id, cfg.stage, 'no_email');
        skipped++;
        continue;
      }

      // Skip clientes já ativos
      if (activeEmailSet.has(session.email.toLowerCase())) {
        await markStageSkipped(supabase, session.id, cfg.stage, 'active_customer_email');
        skipped++;
        continue;
      }
      if (session.phone) {
        const isActive = getPhoneVariations(session.phone).some(v => activePhoneSet.has(v));
        if (isActive) {
          await markStageSkipped(supabase, session.id, cfg.stage, 'active_customer_phone');
          skipped++;
          continue;
        }
      }

      const customerName = session.name || 'você';
      const plan = session.plan || 'essencial';
      const checkoutLink = `https://olaaura.com.br/checkout?plan=${plan}&utm_source=email&utm_medium=recovery&utm_campaign=stage${cfg.stage}`;

      const { data: emailData, error: emailError } = await supabase.functions.invoke('send-transactional-email', {
        body: {
          templateName: cfg.template,
          recipientEmail: session.email,
          idempotencyKey: `checkout-recovery-${cfg.stage}-${session.id}`,
          templateData: { name: customerName, plan, checkoutLink },
        },
      });

      const emailOk = !emailError && !(emailData && emailData.error);
      const errMsg = emailError ? JSON.stringify(emailError, Object.getOwnPropertyNames(emailError)) : (emailData?.error ? JSON.stringify(emailData) : null);

      await supabase.from('checkout_recovery_attempts').insert({
        checkout_session_id: session.id,
        phone_raw: session.phone || null,
        phone_normalized: session.phone ? normalizeBrazilianPhone(session.phone) : null,
        status: emailOk ? `stage_${cfg.stage}_sent` : `stage_${cfg.stage}_failed`,
        error_message: errMsg,
      });

      if (emailOk) {
        const stageColumn = `recovery_stage${cfg.stage}_sent_at`;
        const update: Record<string, any> = {
          recovery_stage: cfg.stage,
          [stageColumn]: new Date().toISOString(),
          recovery_attempts_count: cfg.stage,
          recovery_last_error: null,
        };
        // Mantém compatibilidade com flag antiga (true após primeiro envio)
        if (cfg.stage === 1) {
          update.recovery_sent = true;
          update.recovery_sent_at = new Date().toISOString();
        }
        await supabase.from('checkout_sessions').update(update).eq('id', session.id);
        sent++;
        console.log(`✅ [stage ${cfg.stage}] sent → ${session.email.substring(0, 3)}***`);
      } else {
        await supabase.from('checkout_sessions').update({
          recovery_last_error: errMsg || 'Unknown error',
        }).eq('id', session.id);
        failed++;
        console.error(`❌ [stage ${cfg.stage}] failed:`, errMsg);
      }
    } catch (err) {
      console.error(`❌ [stage ${cfg.stage}] exception:`, err);
      failed++;
    }

    await new Promise(r => setTimeout(r, 300));
  }

  return { sent, failed, skipped };
}

async function markStageSkipped(supabase: any, id: string, stage: number, reason: string) {
  // Avança o estágio para que não seja reavaliado nesta sequência
  const stageColumn = `recovery_stage${stage}_sent_at`;
  await supabase.from('checkout_sessions').update({
    recovery_stage: stage,
    [stageColumn]: new Date().toISOString(),
    recovery_last_error: `skipped: ${reason}`,
  }).eq('id', id);

  await supabase.from('checkout_recovery_attempts').insert({
    checkout_session_id: id,
    status: `stage_${stage}_skipped`,
    error_message: reason,
  }).catch(() => {});
}

// === Código antigo abaixo desativado — mantido como referência ===
function _legacy_unused() {
  const PLAN_LABELS: Record<string, string> = {
    essencial: 'Essencial',
    direcao: 'Direção',
    transformacao: 'Transformação',
  };
  return PLAN_LABELS;
}

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

        // Enhanced error extraction: FunctionsHttpError wraps an HTTP error response
        let emailOk = !emailError;
        let emailBody: string;
        if (emailError) {
          // Try to extract detailed message from FunctionsHttpError
          let detailedError = '';
          try {
            if (typeof emailError === 'object' && emailError !== null) {
              // FunctionsHttpError has a context property with response details
              detailedError = JSON.stringify(emailError, Object.getOwnPropertyNames(emailError));
            } else {
              detailedError = String(emailError);
            }
          } catch {
            detailedError = String(emailError);
          }
          emailBody = detailedError;
          console.error(`❌ [RECOVERY] invoke error details:`, detailedError);
        } else {
          emailBody = JSON.stringify(emailData);
          // Also check if data contains an error response
          if (emailData && typeof emailData === 'object' && emailData.error) {
            emailOk = false;
            emailBody = JSON.stringify(emailData);
            console.error(`❌ [RECOVERY] Email function returned error in body:`, emailBody);
          }
        }

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
          // Don't mark as recovery_sent so it can be retried
          await supabase.from('checkout_sessions').update({
            recovery_sent: false,
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
