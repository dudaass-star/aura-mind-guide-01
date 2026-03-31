import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendProactive } from "../_shared/whatsapp-provider.ts";
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
    const { user_id, episode_id, phone } = await req.json();

    if (!user_id || !episode_id || !phone) {
      throw new Error('user_id, episode_id and phone are required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`🧪 Test: Generating episode for user ${user_id}`);

    // Invoke generate-episode-manifesto with teaser enabled
    const { data: manifestoData, error: manifestoError } = await supabase.functions.invoke('generate-episode-manifesto', {
      body: { user_id, episode_id, generate_teaser: true }
    });

    if (manifestoError || !manifestoData?.success) {
      throw new Error(`Manifesto generation failed: ${manifestoError?.message || manifestoData?.error}`);
    }

    console.log(`✅ Episode generated (teaser: ${manifestoData.teaser ? 'yes' : 'no'}), sending via provider...`);

    const cleanPhone = cleanPhoneNumber(phone);
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
