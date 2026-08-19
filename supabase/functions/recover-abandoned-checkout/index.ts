import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeBrazilianPhone, getPhoneVariations } from "../_shared/zapi-client.ts";
import { loadWooviCommitmentSets, hasLiveWooviCommitment } from "../_shared/woovi-recovery-guard.ts";

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

    // Guarda "já pagou": nunca recuperar quem tem pagamento pago, mesmo sem
    // profile ativo (ex.: PIX Automático que ainda não foi reconciliado).
    const { data: paidPix } = await supabase
      .from('asaas_payments')
      .select('customer_phone, customer_email')
      .in('status', ['RECEIVED', 'CONFIRMED']);
    if (paidPix) {
      for (const p of paidPix) {
        if (p.customer_phone) {
          for (const v of getPhoneVariations(p.customer_phone)) activePhoneSet.add(v);
        }
        if (p.customer_email) activeEmailSet.add(p.customer_email.toLowerCase());
      }
    }

    const { data: completedCheckouts } = await supabase
      .from('checkout_sessions')
      .select('phone, email')
      .eq('status', 'completed');
    if (completedCheckouts) {
      for (const c of completedCheckouts) {
        if (c.phone) {
          for (const v of getPhoneVariations(c.phone)) activePhoneSet.add(v);
        }
        if (c.email) activeEmailSet.add(c.email.toLowerCase());
      }
    }

    // Trilho Woovi (PIX Automático): mandato aprovado / entrada ou parcela paga
    // não é abandono. A parcela do carnê não vem por webhook, então a
    // reconciliação local pode chegar depois do lembrete.
    try {
      const woovi = await loadWooviCommitmentSets(supabase);
      for (const e of woovi.emails) activeEmailSet.add(e);
      for (const p of woovi.phones) activePhoneSet.add(p);
      console.log(`💚 [RECOVERY] Woovi guard: ${woovi.emails.size} e-mails / ${woovi.phones.size} telefones com compromisso.`);
    } catch (wErr) {
      console.warn('⚠️ [RECOVERY] Woovi guard falhou:', wErr);
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
