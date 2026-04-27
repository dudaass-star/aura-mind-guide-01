/**
 * DEBUG (TEMPORÁRIO) — dispara templates Quick Reply para o telefone de teste
 * (5551981519708) para capturar payloads reais de clique no webhook-twilio.
 *
 * Remover após análise dos cliques.
 */

import { sendForcedTemplate } from "../_shared/whatsapp-provider.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TEST_PHONE = '5551981519708';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const results: Array<Record<string, unknown>> = [];

  try {
    console.log(`🧪 [DEBUG] Disparando pergunta_semanal → ${TEST_PHONE}`);
    const r1 = await sendForcedTemplate(TEST_PHONE, 'weekly_question');
    results.push({ template: 'pergunta_semanal', ...r1 });

    // Aguarda 3s para evitar ordem invertida na tela
    await new Promise((r) => setTimeout(r, 3000));

    console.log(`🧪 [DEBUG] Disparando carta_mensal → ${TEST_PHONE}`);
    const r2 = await sendForcedTemplate(TEST_PHONE, 'monthly_letter');
    results.push({ template: 'carta_mensal', ...r2 });

    return new Response(JSON.stringify({ ok: true, results }, null, 2), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('❌ [DEBUG] Erro disparando templates:', err);
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: message, results }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});