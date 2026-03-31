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

    // Verify admin JWT
    const authHeader = req.headers.get('authorization');
    if (!authHeader) throw new Error('Missing authorization header');

    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) throw new Error('Unauthorized');

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Check admin role
    const { data: isAdmin } = await serviceClient.rpc('has_role', { _user_id: user.id, _role: 'admin' });
    if (!isAdmin) throw new Error('Forbidden: admin role required');

    const { id, updates } = await req.json();
    if (!id || !updates || Object.keys(updates).length === 0) {
      throw new Error('id and updates are required');
    }

    // Only allow specific fields
    const allowed: Record<string, unknown> = {};
    if ('twilio_content_sid' in updates) allowed.twilio_content_sid = updates.twilio_content_sid;
    if ('is_active' in updates) allowed.is_active = updates.is_active;

    if (Object.keys(allowed).length === 0) throw new Error('No valid fields to update');

    const { data, error } = await serviceClient
      .from('whatsapp_templates')
      .update(allowed)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Update failed: ${error.message}`);

    return new Response(JSON.stringify({ status: 'updated', template: data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    const status = msg.includes('Unauthorized') || msg.includes('Forbidden') ? 403 : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
