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
    const { journey_id, portal_token } = await req.json();

    if (!journey_id) {
      return new Response(
        JSON.stringify({ error: 'journey_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    let userId: string | null = null;
    const authorization = req.headers.get("authorization") || "";
    const jwt = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (jwt) {
      const authClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } },
      );
      const { data } = await authClient.auth.getClaims(jwt);
      userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
    }
    if (!userId && typeof portal_token === "string" && portal_token.length >= 32) {
      const { data: portalAccess } = await supabase.from("user_portal_tokens")
        .select("user_id").eq("token", portal_token).maybeSingle();
      userId = portalAccess?.user_id || null;
    }
    if (!userId) {
      return new Response(JSON.stringify({ error: "Acesso não reconhecido" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: entitled, error: entitlementError } = await supabase
      .rpc("has_portal_entitlement", { _user_id: userId });
    if (entitlementError) throw entitlementError;
    if (!entitled) {
      return new Response(JSON.stringify({ error: "Seu acesso não está liberado" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
       .eq('user_id', userId)
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

    console.log(`✅ User ${profile.name || userId} chose journey: ${journey.title}`);

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
