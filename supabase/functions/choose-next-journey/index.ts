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
    const { user_id, journey_id } = await req.json();

    if (!user_id || !journey_id) {
      return new Response(
        JSON.stringify({ error: 'user_id and journey_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Validate journey exists and is active
    const { data: journey, error: journeyError } = await supabase
      .from('content_journeys')
      .select('id, title, is_active')
      .eq('id', journey_id)
      .single();

    if (journeyError || !journey) {
      return new Response(
        JSON.stringify({ error: 'Jornada não encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!journey.is_active) {
      return new Response(
        JSON.stringify({ error: 'Esta jornada não está disponível no momento' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate user exists
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, user_id, name, current_journey_id')
      .eq('user_id', user_id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: 'Perfil não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Record the previous journey as completed if user had one
    if (profile.current_journey_id) {
      await supabase
        .from('user_journey_history')
        .insert({
          user_id: profile.user_id,
          journey_id: profile.current_journey_id,
        });
      console.log(`📜 Recorded journey ${profile.current_journey_id} in history`);
    }

    // Update profile with chosen journey
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        current_journey_id: journey_id,
        current_episode: 0,
        last_content_sent_at: null, // Reset so next periodic-content sends EP1
      })
      .eq('id', profile.id);

    if (updateError) {
      console.error('❌ Error updating profile:', updateError);
      return new Response(
        JSON.stringify({ error: 'Erro ao atualizar perfil' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ User ${profile.name || user_id} chose journey: ${journey.title}`);

    return new Response(
      JSON.stringify({ success: true, journey_title: journey.title }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ choose-next-journey error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
