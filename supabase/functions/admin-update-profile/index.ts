import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { profile_id, updates } = await req.json();

    if (!profile_id || !updates || Object.keys(updates).length === 0) {
      throw new Error('profile_id and updates are required');
    }

    console.log(`🔧 [Admin] Updating profile ${profile_id}:`, JSON.stringify(updates));

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', profile_id)
      .select()
      .single();

    if (error) {
      throw new Error(`Update failed: ${error.message}`);
    }

    console.log('✅ Profile updated successfully');

    return new Response(JSON.stringify({ status: 'updated', profile: data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('❌ Update error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
