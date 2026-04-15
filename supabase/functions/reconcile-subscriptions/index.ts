import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Map Stripe price IDs to plan names
function getPlanFromPriceId(priceId: string): string | null {
  const priceEnvMap: Record<string, string> = {
    [Deno.env.get('STRIPE_PRICE_ESSENCIAL_MONTHLY') || '']: 'essencial',
    [Deno.env.get('STRIPE_PRICE_ESSENCIAL_YEARLY') || '']: 'essencial',
    [Deno.env.get('STRIPE_PRICE_DIRECAO_MONTHLY') || '']: 'direcao',
    [Deno.env.get('STRIPE_PRICE_DIRECAO_YEARLY') || '']: 'direcao',
    [Deno.env.get('STRIPE_PRICE_TRANSFORMACAO_MONTHLY') || '']: 'transformacao',
    [Deno.env.get('STRIPE_PRICE_TRANSFORMACAO_YEARLY') || '']: 'transformacao',
  };
  delete priceEnvMap['']; // Remove empty keys
  return priceEnvMap[priceId] || null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');

  if (!stripeSecretKey) {
    return new Response(JSON.stringify({ error: 'STRIPE_SECRET_KEY not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { dry_run = false } = await req.json().catch(() => ({}));
    
    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' });
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`🔄 [Reconcile] Starting reconciliation (dry_run=${dry_run})`);

    // List all active Stripe subscriptions
    const allSubscriptions: Stripe.Subscription[] = [];
    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore) {
      const params: Stripe.SubscriptionListParams = {
        status: 'active',
        limit: 100,
        expand: ['data.customer'],
      };
      if (startingAfter) params.starting_after = startingAfter;

      const subs = await stripe.subscriptions.list(params);
      allSubscriptions.push(...subs.data);
      hasMore = subs.has_more;
      if (subs.data.length > 0) {
        startingAfter = subs.data[subs.data.length - 1].id;
      }
    }

    console.log(`📋 [Reconcile] Found ${allSubscriptions.length} active Stripe subscriptions`);

    const fixes: Array<{
      phone: string;
      name: string;
      issue: string;
      action: string;
      plan: string;
    }> = [];

    const errors: Array<{ subscription_id: string; error: string }> = [];

    for (const sub of allSubscriptions) {
      try {
        const customer = sub.customer as Stripe.Customer;
        if (!customer || customer.deleted) continue;

        const phone = customer.metadata?.phone;
        if (!phone) {
          errors.push({
            subscription_id: sub.id,
            error: `Customer ${customer.id} (${customer.name || customer.email}) has no phone in metadata`,
          });
          continue;
        }

        const cleanPhone = phone.replace(/\D/g, '');
        const priceId = sub.items.data[0]?.price?.id;
        const expectedPlan = priceId ? getPlanFromPriceId(priceId) : null;

        if (!expectedPlan) {
          errors.push({
            subscription_id: sub.id,
            error: `Unknown price ID ${priceId} for customer ${customer.name || cleanPhone}`,
          });
          continue;
        }

        // Look up profile
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id, user_id, name, phone, status, plan')
          .eq('phone', cleanPhone)
          .maybeSingle();

        if (profileError) {
          errors.push({
            subscription_id: sub.id,
            error: `Error fetching profile for phone ${cleanPhone}: ${profileError.message}`,
          });
          continue;
        }

        if (!profile) {
          fixes.push({
            phone: cleanPhone,
            name: customer.name || 'Desconhecido',
            issue: 'Perfil não encontrado no banco',
            action: dry_run ? 'Seria necessário criar perfil manualmente' : 'Perfil não criado (requer ação manual)',
            plan: expectedPlan,
          });
          continue;
        }

        // Check for inconsistencies
        const needsStatusFix = profile.status !== 'active';
        const needsPlanFix = profile.plan !== expectedPlan;

        if (!needsStatusFix && !needsPlanFix) continue;

        const issues: string[] = [];
        if (needsStatusFix) issues.push(`status: ${profile.status} → active`);
        if (needsPlanFix) issues.push(`plan: ${profile.plan} → ${expectedPlan}`);

        if (!dry_run) {
          const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
          if (needsStatusFix) updates.status = 'active';
          if (needsPlanFix) updates.plan = expectedPlan;

          const { error: updateError } = await supabase
            .from('profiles')
            .update(updates)
            .eq('id', profile.id);

          if (updateError) {
            errors.push({
              subscription_id: sub.id,
              error: `Failed to update profile ${profile.id}: ${updateError.message}`,
            });
            continue;
          }
        }

        fixes.push({
          phone: cleanPhone,
          name: profile.name || customer.name || 'Desconhecido',
          issue: issues.join(', '),
          action: dry_run ? 'Correção pendente (dry run)' : 'Corrigido',
          plan: expectedPlan,
        });

      } catch (subError: unknown) {
        const msg = subError instanceof Error ? subError.message : String(subError);
        errors.push({ subscription_id: sub.id, error: msg });
      }
    }

    const result = {
      total_active_subscriptions: allSubscriptions.length,
      inconsistencies_found: fixes.length,
      fixes,
      errors,
      dry_run,
    };

    console.log(`✅ [Reconcile] Done: ${fixes.length} inconsistencies, ${errors.length} errors`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('❌ [Reconcile] Error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
