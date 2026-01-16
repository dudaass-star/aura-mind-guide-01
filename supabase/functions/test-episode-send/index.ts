import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    // Invoke generate-episode-manifesto
    const { data: manifestoData, error: manifestoError } = await supabase.functions.invoke('generate-episode-manifesto', {
      body: { user_id, episode_id }
    });

    if (manifestoError || !manifestoData?.success) {
      throw new Error(`Manifesto generation failed: ${manifestoError?.message || manifestoData?.error}`);
    }

    console.log('✅ Episode generated, sending via Z-API...');

    // Send via send-zapi-message
    const { data: sendData, error: sendError } = await supabase.functions.invoke('send-zapi-message', {
      body: { 
        phone, 
        message: manifestoData.message,
        user_id 
      }
    });

    if (sendError) {
      throw new Error(`Send failed: ${sendError.message}`);
    }

    console.log('✅ Message sent successfully');

    return new Response(JSON.stringify({ 
      success: true,
      episode: manifestoData.stage_title,
      episode_number: manifestoData.episode_number,
      send_result: sendData
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
