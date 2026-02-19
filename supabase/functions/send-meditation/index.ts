import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  sendAudioFromUrl,
  sendTextMessage,
  cleanPhoneNumber,
} from "../_shared/zapi-client.ts";
import { getInstanceConfigForUser, getInstanceConfigForPhone } from "../_shared/instance-helper.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate service role authentication
    const authHeader = req.headers.get('Authorization');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    if (!authHeader || !authHeader.includes(supabaseServiceKey)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { meditation_id, category, user_id, phone, context } = await req.json();

    if (!meditation_id && !category) {
      return new Response(JSON.stringify({ error: 'meditation_id or category is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!phone && !user_id) {
      return new Response(JSON.stringify({ error: 'phone or user_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`🧘 Sending meditation - category: ${category}, meditation_id: ${meditation_id}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Buscar telefone do usuário se não foi fornecido
    let userPhone = phone;
    let userId = user_id;

    if (!userPhone && user_id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('phone')
        .eq('user_id', user_id)
        .single();
      
      userPhone = profile?.phone;
    }

    if (!userPhone) {
      return new Response(JSON.stringify({ error: 'Could not determine user phone' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Buscar user_id pelo telefone se não foi fornecido
    if (!userId && userPhone) {
      const cleanPhone = cleanPhoneNumber(userPhone);
      const { data: profile } = await supabase
        .from('profiles')
        .select('user_id')
        .or(`phone.eq.${cleanPhone},phone.ilike.%${cleanPhone}%`)
        .single();
      
      userId = profile?.user_id;
    }

    // Get instance config for this user
    let zapiConfig = undefined;
    if (userId) {
      try {
        zapiConfig = await getInstanceConfigForUser(supabase, userId);
      } catch (e) {
        console.warn('⚠️ Could not get instance config, using env vars');
      }
    }

    // Buscar meditação
    let selectedMeditationId = meditation_id;

    if (!selectedMeditationId && category) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: meditations } = await supabase
        .from('meditations')
        .select('id')
        .eq('category', category)
        .eq('is_active', true);

      if (!meditations || meditations.length === 0) {
        console.error(`No meditations found for category: ${category}`);
        return new Response(JSON.stringify({ error: `No meditations found for category: ${category}` }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let availableMeditations = meditations.map(m => m.id);

      if (userId) {
        const { data: history } = await supabase
          .from('user_meditation_history')
          .select('meditation_id')
          .eq('user_id', userId)
          .gte('sent_at', thirtyDaysAgo.toISOString());

        const recentlyUsed = new Set(history?.map(h => h.meditation_id) || []);
        const notRecentlyUsed = availableMeditations.filter(id => !recentlyUsed.has(id));
        
        if (notRecentlyUsed.length > 0) {
          availableMeditations = notRecentlyUsed;
        }
      }

      selectedMeditationId = availableMeditations[Math.floor(Math.random() * availableMeditations.length)];
      console.log(`📌 Selected meditation: ${selectedMeditationId} from ${availableMeditations.length} options`);
    }

    // Buscar áudio da meditação
    const { data: audioData, error: audioError } = await supabase
      .from('meditation_audios')
      .select('public_url, duration_seconds')
      .eq('meditation_id', selectedMeditationId)
      .single();

    if (audioError || !audioData) {
      console.error(`Audio not found for meditation: ${selectedMeditationId}`, audioError);
      
      await sendTextMessage(
        userPhone,
        "🧘 Ops, parece que essa meditação ainda não está pronta. Me perdoa! Vou providenciar e te aviso quando estiver disponível. 💜",
        undefined,
        zapiConfig
      );
      
      return new Response(JSON.stringify({ 
        error: 'Meditation audio not found',
        meditation_id: selectedMeditationId,
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Buscar título da meditação para a mensagem de introdução
    const { data: meditation } = await supabase
      .from('meditations')
      .select('title, duration_seconds')
      .eq('id', selectedMeditationId)
      .single();

    const durationMinutes = Math.round((audioData.duration_seconds || meditation?.duration_seconds || 300) / 60);
    const introMessage = `🧘 *${meditation?.title || 'Meditação Guiada'}*\n\nDuração: ~${durationMinutes} minutos\n\nEncontre um lugar tranquilo, feche os olhos e me deixe te guiar... 💜`;
    
    await sendTextMessage(userPhone, introMessage, undefined, zapiConfig);

    await new Promise(resolve => setTimeout(resolve, 1500));

    console.log(`🎧 Sending audio from URL: ${audioData.public_url}`);
    const audioResult = await sendAudioFromUrl(userPhone, audioData.public_url, zapiConfig);

    if (!audioResult.success) {
      console.error('Failed to send audio:', audioResult.error);
      
      await sendTextMessage(
        userPhone,
        `🎧 Tive um probleminha para enviar o áudio direto. Você pode ouvir aqui: ${audioData.public_url}`,
        undefined,
        zapiConfig
      );
    }

    if (userId) {
      await supabase
        .from('user_meditation_history')
        .insert({
          user_id: userId,
          meditation_id: selectedMeditationId,
          context: context || null,
        });
    }

    return new Response(JSON.stringify({
      success: true,
      meditation_id: selectedMeditationId,
      audio_url: audioData.public_url,
      duration_seconds: audioData.duration_seconds,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in send-meditation:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
