// Cron 5min → recomputa e persiste as métricas do dashboard de Engajamento
// para as janelas padrão (today / 7d / 14d / 30d / 90d), gravando na tabela
// admin_metrics_snapshots. Aciona a função admin-engagement-metrics com
// forceRefresh=true e header x-internal-secret para bypass do auth de admin.
//
// Auth: o cron chama esta função com o segredo `admin_metrics_snapshot_secret`
// guardado no vault. Lemos o mesmo segredo aqui via service role.
//
// Idempotente: se rodar em paralelo, o UPSERT por window_key resolve.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
};

const WINDOWS: { key: string; days: number }[] = [
  { key: 'today', days: 0 },
  { key: '7d', days: 7 },
  { key: '14d', days: 14 },
  { key: '30d', days: 30 },
  { key: '90d', days: 90 },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Lê o segredo compartilhado com o cron via função SECURITY DEFINER.
    const { data: secretValue, error: secretErr } = await admin.rpc('get_admin_metrics_snapshot_secret');
    if (secretErr || !secretValue) {
      console.error('❌ snapshot secret missing:', secretErr);
      return new Response(JSON.stringify({ error: 'snapshot secret missing' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const internalSecret = secretValue as string;

    const provided = req.headers.get('x-internal-secret');
    if (provided !== internalSecret) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const today = new Date().toISOString().slice(0, 10);
    const startedAt = Date.now();
    const results: { window: string; ok: boolean; ms?: number; error?: string }[] = [];

    // Paralelo: cada janela ~30-60s. Sequencial estouraria o limite de execução da edge fn.
    // A função alvo já paraleliza chamadas Stripe internamente e é idempotente por window_key.
    await Promise.all(WINDOWS.map(async (w) => {
      const t0 = Date.now();
      const dateFrom = new Date(Date.now() - w.days * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/admin-engagement-metrics`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': internalSecret,
            // Necessário para o Supabase edge runtime não recusar o request:
            'Authorization': `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({ dateFrom, dateTo: today, forceRefresh: true }),
        });
        const ms = Date.now() - t0;
        if (!resp.ok) {
          const txt = await resp.text().catch(() => '');
          results.push({ window: w.key, ok: false, ms, error: `HTTP ${resp.status}: ${txt.slice(0, 200)}` });
          console.error(`❌ snapshot ${w.key} failed: ${resp.status}`);
          return;
        }
        await resp.body?.cancel();
        results.push({ window: w.key, ok: true, ms });
        console.log(`✅ snapshot ${w.key} refreshed in ${ms}ms`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        results.push({ window: w.key, ok: false, ms: Date.now() - t0, error: msg });
        console.error(`❌ snapshot ${w.key} error:`, msg);
      }
    }));

    const totalMs = Date.now() - startedAt;
    console.log(`🏁 snapshot batch done in ${totalMs}ms`);

    return new Response(
      JSON.stringify({ ok: true, totalMs, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'unknown';
    console.error('❌ snapshot batch fatal:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});