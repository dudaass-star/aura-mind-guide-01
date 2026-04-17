import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendProactive, sendForcedTemplate } from "../_shared/whatsapp-provider.ts";
import { cleanPhoneNumber } from "../_shared/zapi-client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_id, episode_id, phone, force_template = false } = await req.json();

    if (!user_id || !episode_id || !phone) {
      throw new Error('user_id, episode_id and phone are required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`🧪 Test: Generating episode for user ${user_id} (force_template=${force_template})`);

    // Invoke generate-episode-manifesto with teaser enabled
    const { data: manifestoData, error: manifestoError } = await supabase.functions.invoke('generate-episode-manifesto', {
      body: { user_id, episode_id, generate_teaser: true }
    });

    if (manifestoError || !manifestoData?.success) {
      throw new Error(`Manifesto generation failed: ${manifestoError?.message || manifestoData?.error}`);
    }

    console.log(`✅ Episode generated (teaser: ${manifestoData.teaser ? 'yes' : 'no'})`);

    // Save full content as pending_insight with [CONTENT] marker for button click delivery
    try {
      await supabase.from('profiles').update({
        pending_insight: `[CONTENT]${manifestoData.message}`,
      }).eq('user_id', user_id);
    } catch (e) {
      console.warn('⚠️ Could not save pending_insight [CONTENT]:', e);
    }

    const cleanPhone = cleanPhoneNumber(phone);

    // ─────────────────────────────────────────────────────────────────────
    // FORCE_TEMPLATE: caminho determinístico — envia o template oficial
    // jornada_disponivel diretamente, sem depender de janela de 24h nem
    // do provider ativo. Falha fechado se não sair como template.
    // ─────────────────────────────────────────────────────────────────────
    if (force_template) {
      console.log(`🎯 [Force Template] Sending jornada_disponivel via deterministic path`);

      const sendResult = await sendForcedTemplate(
        cleanPhone,
        'content',
        user_id,
      );

      if (!sendResult.success || sendResult.type !== 'template') {
        const reason = sendResult.error || `Unexpected send type: ${sendResult.type}`;
        console.error(`❌ [Force Template] Failed: ${reason}`);
        return new Response(JSON.stringify({
          success: false,
          mode: 'force_template',
          provider: sendResult.provider,
          send_type: sendResult.type,
          error: reason,
        }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`✅ [Force Template] Template sent via ${sendResult.provider}`);
      return new Response(JSON.stringify({
        success: true,
        mode: 'force_template',
        provider: sendResult.provider,
        send_type: sendResult.type,
        template_category: 'content',
        episode: manifestoData.stage_title,
        episode_number: manifestoData.episode_number,
        had_teaser: !!manifestoData.teaser,
        note: 'Template enviado. O conteúdo rico está em pending_insight e será entregue quando o usuário clicar no botão "Acessar".',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─────────────────────────────────────────────────────────────────────
    // Caminho normal: roteamento automático (janela 24h + provider ativo)
    // ─────────────────────────────────────────────────────────────────────
    const sendResult = await sendProactive(
      cleanPhone,
      manifestoData.message,
      'content',
      user_id,
      undefined,
      manifestoData.teaser || undefined
    );

    console.log(`✅ Message sent via ${sendResult.provider}`);

    return new Response(JSON.stringify({
      success: true,
      mode: 'auto',
      provider: sendResult.provider,
      episode: manifestoData.stage_title,
      episode_number: manifestoData.episode_number,
      had_teaser: !!manifestoData.teaser,
      send_result: sendResult
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Test error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
