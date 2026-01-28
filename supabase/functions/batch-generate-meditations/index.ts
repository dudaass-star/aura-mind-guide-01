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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Buscar todas as meditações que ainda não têm áudio
    const { data: meditations, error: meditationsError } = await supabase
      .from('meditations')
      .select('id, title')
      .eq('is_active', true);

    if (meditationsError) {
      throw new Error(`Failed to fetch meditations: ${meditationsError.message}`);
    }

    // Verificar quais já têm áudio
    const { data: existingAudios } = await supabase
      .from('meditation_audios')
      .select('meditation_id');

    const existingIds = new Set(existingAudios?.map(a => a.meditation_id) || []);
    const pendingMeditations = meditations?.filter(m => !existingIds.has(m.id)) || [];

    console.log(`📋 Found ${meditations?.length || 0} meditations, ${pendingMeditations.length} pending audio generation`);

    if (pendingMeditations.length === 0) {
      return new Response(JSON.stringify({
        message: 'All meditations already have audio',
        total: meditations?.length || 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: { id: string; title: string; status: string; error?: string }[] = [];

    // Gerar áudio para cada meditação pendente com timeout de 5 minutos
    const GENERATION_TIMEOUT = 5 * 60 * 1000; // 5 minutos
    
    for (const meditation of pendingMeditations) {
      console.log(`🧘 Generating audio for: ${meditation.id} - ${meditation.title}`);
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), GENERATION_TIMEOUT);
        
        const response = await fetch(`${supabaseUrl}/functions/v1/generate-meditation-audio`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseServiceKey,
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({ meditation_id: meditation.id }),
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ Failed: ${meditation.id}`, errorText);
          results.push({ id: meditation.id, title: meditation.title, status: 'error', error: errorText });
        } else {
          const data = await response.json();
          console.log(`✅ Success: ${meditation.id}`, data);
          results.push({ id: meditation.id, title: meditation.title, status: 'success' });
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ Exception: ${meditation.id}`, errorMsg);
        results.push({ id: meditation.id, title: meditation.title, status: 'error', error: errorMsg });
      }

      // Delay entre gerações para não sobrecarregar a API do Google
      if (pendingMeditations.indexOf(meditation) < pendingMeditations.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    const successful = results.filter(r => r.status === 'success').length;
    const failed = results.filter(r => r.status === 'error').length;

    return new Response(JSON.stringify({
      message: `Generated ${successful} audios, ${failed} failed`,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in batch-generate-meditations:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
